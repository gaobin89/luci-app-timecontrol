'use strict';
'require view';
'require ui';
'require rpc';
'require poll';
'require uci';
'require form';
'require firewall as fwmodel';
'require tools.firewall as fwtool';
'require tools.widgets as widgets';

function rule_macaddrlist_txt(s, hosts) {
	var result = uci.get('timecontrol', s, 'macaddrlist');
	if (typeof result === 'string') {
		result = result.toUpperCase();
	} else if (Array.isArray(result)) {
		result = result.map(item => typeof item === 'string' ? item.toUpperCase() : item);
	}
	if (!result || (typeof result === 'string' && result.trim() === '')) {
		result = _('AllClients');
	}
	return fwtool.fmt(_('%{macaddrlist#%{next?, }<var>%{item.ival}</var>}'), {
		macaddrlist: fwtool.map_invert(result).map(function (v) { return Object.assign(v, { hint: hosts[v.val] }) })
	});
}

function rule_timerangelist_txt(s) {
	var result = uci.get('timecontrol', s, 'timerangelist');
	if (!result || (typeof result === 'string' && result.trim() === '')) {
		result = _('AnyTime');
	}
	return fwtool.fmt(_('%{timerangelist#%{next?, }<var>%{item.ival}</var>}'), {
		timerangelist: fwtool.map_invert(result)
	});
}

function rule_unblockDuration_txt(s) {
	var result = uci.get('timecontrol', s, 'unblockDuration');
	if (!result || (typeof result === 'string' && result.trim() === '')) {
		result = '0';
	}
	return fwtool.fmt(_('%{unblockDuration#%{next? }<var>%{item.ival}</var>}'), {
		unblockDuration: fwtool.map_invert(result + ' ' + _('(minutes)'))
	});
}

function rule_weekdays_txt(s) {
	var result = uci.get('timecontrol', s, 'weekdays');
	const weekMap = {
		'Sunday': _('Sunday'),
		'Monday': _('Monday'),
		'Tuesday': _('Tuesday'),
		'Wednesday': _('Wednesday'),
		'Thursday': _('Thursday'),
		'Friday': _('Friday'),
		'Saturday': _('Saturday')
	};

	if (!result || (typeof result === 'string' && result.trim() === '')) {
		result = _('AnyDay');
	} else if (typeof result === 'string') {
		const days = result.trim().split(/\s+/);
		if (days.length === 7) {
			result = _('AnyDay');
		} else {
			result = days.map(day => weekMap[day] || day).join(' ');
		}
	} //else if (Array.isArray(result)) {
	//	result = result.map(day => weekMap[day] || day);
	//	console.log('result:', result);
	//}

	return fwtool.fmt(_('%{weekdays#%{next?, }<var>%{item.ival}</var>}'), {
		weekdays: fwtool.map_invert(result)
	});
}

var callExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: ['command', 'params', 'env']
});

function detectFirewallType() {
	return L.resolveDefault(callExec('/usr/bin/which', ['nft']), {})
		.then(function (res) {
			return {
				isFw4: res.code === 0,
				isFw3: res.code !== 0
			};
		})
		.catch(function (err) {
			console.error('Error detecting firewall type:', err);
			return {
				isFw4: false,
				isFw3: false,
				error: true
			};
		});
}

function checkFirewallChain() {
	return detectFirewallType().then(function (fwType) {
		if (fwType.error) {
			return Promise.reject('Failed to detect firewall type');
		}
		if (fwType.isFw4) {
			return checkNftablesChain('timecontrol_forward_reject');
		} else if (fwType.isFw3) {
			return checkIptablesChain('timecontrol_forward_reject');
		} else {
			return Promise.reject('Unknown firewall type');
		}
	});
}

function checkNftablesChain(chainName, table = 'fw4') {
	return L.resolveDefault(callExec('/usr/sbin/nft', ['list', 'chain', 'inet', table, chainName]), {})
		.then(function (res) {
			return {
				exists: res.code === 0,
				output: res.stdout,
				table: table,
				type: 'nftables',
				command: 'nft list chain ' + table + ' ' + chainName
			};
		});
}

function checkIptablesChain(chainName, table = 'filter', ipv6 = false) {
	var cmd = ipv6 ? '/usr/sbin/ip6tables' : '/usr/sbin/iptables';

	return L.resolveDefault(callExec(cmd, ['-t', table, '-nL', chainName]), {})
		.then(function (res) {
			return {
				exists: res.code === 0,
				output: res.stdout,
				table: table,
				type: ipv6 ? 'ip6tables' : 'iptables',
				command: cmd + ' -t ' + table + ' -nL ' + chainName,
				isIPv6: ipv6
			};
		});
}

function getFirewallChainStatus() {
	return checkFirewallChain().then(function (res) {
		return res && res.exists === true;
	}).catch(function (err) {
		console.error('Error checking firewall chain:', err);
		return false;
	});
}

function renderStatus(isRunning) {
	var spanTemp = '<em><span style="color:%s"><strong>%s %s</strong></span></em>';
	var renderHTML;
	if (isRunning) {
		renderHTML = String.format(spanTemp, 'green', _('Control'), _('Enabled'));
	} else {
		renderHTML = String.format(spanTemp, 'red', _('Control'), _('Disabled'));
	}

	return renderHTML;
}

return view.extend({
	callHostHints: rpc.declare({
		object: 'luci-rpc',
		method: 'getHostHints',
		expect: { '': {} }
	}),

	load: function () {
		return Promise.all([
			this.callHostHints(),
			uci.load('timecontrol')
		]);
	},

	render: function (data) {
		if (fwtool.checkLegacySNAT())
			return fwtool.renderMigration();
		else
			return this.renderRules(data);
	},

	renderRules: function (data) {
		var hosts = data[0],
			m, s, o;

		m = new form.Map('timecontrol', _('Internet Time Control'),
			_('Users can limit Internet usage time by MAC address, support iptables/nftables IPv4/IPv6'));

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			poll.add(function () {
				return L.resolveDefault(getFirewallChainStatus()).then(function (res) {
					var view = document.getElementById("firewall_status");
					console.log('firewall_status:', res);
					view.innerHTML = renderStatus(res);
				});
			});

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
				E('p', { id: 'firewall_status' }, _('Collecting data ...'))
			]);
		}

		s = m.section(form.TypedSection, 'basic', _('Global Settings'));
		s.anonymous = true;
		s.addremove = false;
		o = s.option(form.Flag, 'enable', _('Enable'));
		o.default = o.disabled;
		o.rmempty = false;

		s = m.section(form.GridSection, 'rule', _('Control Rules'));
		s.addremove = true;
		s.anonymous = true;
		s.sortable = true;
		s.cloneable = true;

		s.tab('general', _('General Settings'));
		s.tab('timed', _('Time Restrictions'));

		s.sectiontitle = function (section_id) {
			return uci.get('timecontrol', section_id, 'name') || _('Unnamed rule');
		};

		o = s.taboption('general', form.Value, 'name', _('Name'));
		o.placeholder = _('Unnamed rule');
		o.modalonly = true;

		o = s.option(form.Flag, 'enable', _('Enable'));
		o.modalonly = false;
		o.default = o.disabled;
		o.editable = true;

		o = s.option(form.ListValue, 'unblockDuration', _('Temporary Unblock'));
		o.modalonly = false;
		o.textvalue = function (s) {
			return rule_unblockDuration_txt(s);
		};

		o = s.option(form.DummyValue, 'macaddrlist', _('Client MAC'));
		o.modalonly = false;
		o.textvalue = function (s) {
			return rule_macaddrlist_txt(s, hosts);
		};

		o = s.option(form.ListValue, 'timerangelist', _('Time Ranges'));
		o.modalonly = false;
		o.textvalue = function (s) {
			return rule_timerangelist_txt(s);
		};

		o = s.option(form.ListValue, 'weekdays', _('Week Days'));
		o.modalonly = false;
		o.textvalue = function (s) {
			return rule_weekdays_txt(s);
		};

		fwtool.addMACOption(s, 'general', 'macaddrlist', _('Client MAC'), null, hosts);

		o = s.taboption('timed', form.Value, 'unblockDuration', _('Temporary Unblock'));
		o.modalonly = true;
		o.default = '0';
		o.datatype = 'range(0,720)';
		o.value('0', '0' + ' ' + _('(minutes)'));
		o.value('5', '5' + ' ' + _('(minutes)'));
		o.value('10', '10' + ' ' + _('(minutes)'));
		o.value('15', '15' + ' ' + _('(minutes)'));
		o.value('30', '30' + ' ' + _('(minutes)'));
		o.value('45', '45' + ' ' + _('(minutes)'));
		o.value('60', '60' + ' ' + _('(minutes)'));
		o.value('90', '90' + ' ' + _('(minutes)'));
		o.value('120', '120' + ' ' + _('(minutes)'));

		o = s.taboption('timed', form.MultiValue, 'weekdays', _('Week Days'));
		o.modalonly = true;
		o.multiple = true;
		o.display = 5;
		o.placeholder = _('AnyDay');
		o.value('Sunday', _('Sunday'));
		o.value('Monday', _('Monday'));
		o.value('Tuesday', _('Tuesday'));
		o.value('Wednesday', _('Wednesday'));
		o.value('Thursday', _('Thursday'));
		o.value('Friday', _('Friday'));
		o.value('Saturday', _('Saturday'));
		o.write = function (section_id, value) {
			return this.super('write', [section_id, L.toArray(value).join(' ')]);
		};

		o = s.taboption('timed', form.DynamicList, 'timerangelist', _('Time Ranges'));
		o.modalonly = true;
		//o.default = '00:00:00-23:59:59';
		o.placeholder = 'hh:mm:ss-hh:mm:ss';
		o.validate = function (section_id, value) {
			function isValidTimeRange(str) {
				const timeRegex = /^(\d\d):(\d\d):(\d\d)$/;
				const [startTime, endTime] = str.split('-');

				if (!startTime || !endTime) return false;

				const validateTime = (time) => {
					const match = time.match(timeRegex);
					if (!match) return null;
					const [, h, m, s] = match;
					const hours = parseInt(h, 10);
					const minutes = parseInt(m, 10);
					const seconds = parseInt(s, 10);
					if (hours > 23 || minutes > 59 || seconds > 59) return null;
					return hours * 3600 + minutes * 60 + seconds;
				};

				const startSec = validateTime(startTime);
				const endSec = validateTime(endTime);

				return startSec !== null && endSec !== null && startSec < endSec;
			}

			if (!value) return true;

			if (Array.isArray(value)) {
				for (const v of value) {
					if (!isValidTimeRange(v)) {
						return _('Invalid time range') + ': ' + v;
					}
				}
			} else if (typeof value === 'string') {
				if (!isValidTimeRange(value)) {
					return _('Invalid time range') + ': ' + value;
				}
			}

			return true;
		}
		return m.render();
	}
});
