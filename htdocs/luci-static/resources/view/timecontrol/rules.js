'use strict';
'require view';
'require ui';
'require rpc';
'require poll';
'require uci';
'require form';
'require tools.firewall as fwtool';

function rule_macaddrlist_txt(s, hosts) {
	var result = uci.get('timecontrol', s, 'macaddrlist');
	if (typeof result === 'string') {
		result = result.toUpperCase();
	} else if (Array.isArray(result)) {
		result = result.map(item => typeof item === 'string' ? item.toUpperCase() : item);
	}
	if (result === null || result === undefined || (typeof result === 'string' && result.trim() === '')) {
		result = _('AllClients');
	}
	var items = fwtool.map_invert(result);
	return fwtool.fmt(_('%{macaddrlist}'), {
		macaddrlist: formatListWithLineBreaks(items, 1)
	});
}

function rule_timerangelist_txt(s) {
	var result = uci.get('timecontrol', s, 'timerangelist');
	if (result === null || result === undefined || (typeof result === 'string' && result.trim() === '')) {
		result = _('AnyTime');
	}
	var items = fwtool.map_invert(result);
	return fwtool.fmt(_('%{timerangelist}'), {
		timerangelist: formatListWithLineBreaks(items, 1)
	});
}

function rule_unblockDuration_txt(s) {
	var result = uci.get('timecontrol', s, 'unblockDuration');
	if (result === null || result === undefined || (typeof result === 'string' && result.trim() === '')) {
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

	if (result === null || result === undefined || (typeof result === 'string' && result.trim() === '')) {
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

	var items = fwtool.map_invert(result);
	return fwtool.fmt(_('%{weekdays}'), {
		weekdays: formatListWithLineBreaks(items, 3)
	});
}

function formatListWithLineBreaks(items, itemsPerLine = 2) {
	if (items.length <= itemsPerLine) {
		return items.map(item => `<var>${item.ival}</var>`).join(', ');
	}

	return items.reduce((acc, item, index) => {
		acc += `<var>${item.ival}</var>`;
		const isLastItem = index === items.length - 1;
		const isLineEnd = (index + 1) % itemsPerLine === 0;

		if (!isLastItem) {
			acc += isLineEnd ? ', <br>' : ', ';
		}
		return acc;
	}, '');
}

function getUciSection(option, config = 'timecontrol') {
	const sections = uci.sections(config, option);
	return sections.length > 0 ? sections[0]['.name'] : null;
}

function getUciSections(option, config = 'timecontrol') {
	const sections = uci.sections(config, option);
	return Array.isArray(sections) ? sections : [];
}

var callExec = rpc.declare({
	object: 'file',
	method: 'exec',
	params: ['command', 'params', 'env']
});

function checkFirewallChain() {
	var fw4 = L.hasSystemFeature('firewall4');
	if (fw4) {
		return checkNftablesChain('timecontrol_forward_reject');
	} else {
		return checkIptablesChain('timecontrol_forward_reject');
	}
}

function countRules(output, invalidLineCount) {
	if (!output) return 0;
	const lines = output.split('\n').map(l => l.trim());
	const validLines = lines.filter(l => l);
	return Math.max(validLines.length - invalidLineCount, 0);
}

function checkNftablesChain(chainName, table = 'fw4') {
	return L.resolveDefault(callExec('/usr/sbin/nft', ['list', 'chain', 'inet', table, chainName]), {})
		.then(function (res) {
			return {
				exists: res.code === 0,
				output: res.stdout,
				ruleCount: countRules(res.stdout, 4),
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
				ruleCount: countRules(res.stdout, 2),
				table: table,
				type: ipv6 ? 'ip6tables' : 'iptables',
				command: cmd + ' -t ' + table + ' -nL ' + chainName,
				isIPv6: ipv6
			};
		});
}

function getFirewallChainStatus() {
	return checkFirewallChain().then(function (res) {
		return res;
	}).catch(function (err) {
		console.error('Error checking firewall chain:', err);
		return false;
	});
}

function renderStatus(res) {
	var spanTemp = '<em><span style="color:%s"><strong>%s%s</strong></span>\t\t<strong>|</strong>\t\t<span style="color:%s"><strong>%s: %d</strong></span></em>';
	var renderHTML;
	var isRunning = res.exists;
	var statusColor = isRunning ? '#059669' : 'red';
	var statusText = isRunning ? _('Enabled') : _('Disabled');
	var ruleCountColor = res.ruleCount > 0 ? '#059669' : '#f59e0b';
	renderHTML = String.format(spanTemp, statusColor, _('Control'), statusText, ruleCountColor, _('Control Rules'), res.ruleCount);
	return renderHTML;
}

function sortList(o) {
	o.keylist.sort((a, b) => Number(a) - Number(b));
	const keyOrder = o.keylist.map(String);
	o.vallist.sort((a, b) => {
		const aKey = a.split(' ')[0];
		const bKey = b.split(' ')[0];
		return keyOrder.indexOf(aKey) - keyOrder.indexOf(bKey);
	});
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
			_('Users can limit Internet usage time by MAC address, support iptables/nftables IPv4/IPv6') +
			'<br/>' + _('Suggestion and feedback') + ": " + _("<a href='https://github.com/gaobin89/luci-app-timecontrol.git' target='_blank'>GitHub @gaobin89/luci-app-timecontrol</a>") +
			'<br/>');

		s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function () {
			poll.add(function () {
				return L.resolveDefault(getFirewallChainStatus()).then(function (res) {
					var view = document.getElementById("firewall_status");
					view.innerHTML = renderStatus(res);
				});
			});

			return E('div', { class: 'cbi-section', id: 'status_bar' }, [
				E('p', { id: 'firewall_status' }, _('Collecting data ...'))
			]);
		}

		s = m.section(form.NamedSection, 'config', _('Global Settings'));

		o = s.option(form.Flag, 'enable', _('Enable'));
		o.default = o.disabled;
		o.rmempty = false;
		o.handleValueChange = function (section_id, state, ev) {
			this.map.save(null, true);
		}

		o = s.option(form.Value, 'unblockDuration', _('Temporary Unblock'), _('Set unblock duration for all rules'));
		o.modalonly = true;
		//o.depends('enable', '1');
		o.datatype = 'range(0,720)';

		for (var i = 0; i <= 5; i++) {
			o.value(i * 5, i * 5 + ' ' + _('(minutes)'));
		}
		for (var i = 1; i <= 4; i++) {
			o.value(i * 30, i * 30 + ' ' + _('(minutes)'));
		}
		for (var i = 3; i <= 12; i++) {
			o.value(i * 60, i * 60 + ' ' + _('(minutes)'));
		}
		o.write = function (section_id, value) {
			return true;
		};

		o.handleValueChange = function (section_id, state, ev) {
			if (ev.target.value === null || ev.target.value.trim() === '') {
				return;
			}
			var value = ev.target.value.trim() === '0' ? null : ev.target.value;
			var sections = getUciSections('rule');
			if (sections.length === 0) {
				return;
			}
			sections.forEach(element => {
				var sectionId = element['.name'];
				uci.set('timecontrol', sectionId, 'unblockDuration', value);
			});
			this.map.save(null, true);
			this.default = null;
			this.map.reset();
			//location.reload();
		}

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

		o = s.option(form.Flag, 'enable', _('Enable'));
		o.modalonly = false;
		o.default = o.disabled;
		o.editable = true;
		o.handleValueChange = function (section_id, state, ev) {
			//ui.changes.apply(true);
			return this.map.save(null, true);
		};

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

		o = s.taboption('general', form.Flag, 'enable', _('Enable'));
		o.modalonly = true;
		o.default = o.disabled;
		o.editable = true;

		o = s.taboption('general', form.Value, 'name', _('Name'));
		o.placeholder = _('Unnamed rule');
		o.modalonly = true;

		o = s.taboption('general', form.Value, 'unblockDuration', _('Temporary Unblock'));
		o.modalonly = true;
		//o.depends('enable', '1');
		o.datatype = 'range(1,720)';
		for (var i = 1; i <= 5; i++) {
			o.value(i * 5, i * 5 + ' ' + _('(minutes)'));
		}
		for (var i = 1; i <= 4; i++) {
			o.value(i * 30, i * 30 + ' ' + _('(minutes)'));
		}
		for (var i = 3; i <= 12; i++) {
			o.value(i * 60, i * 60 + ' ' + _('(minutes)'));
		}

		o.cfgvalue = function (section_id) {
			var value = uci.get('timecontrol', section_id, 'unblockDuration');
			var unblockDuration = value == 0 ? null : value;
			if (this.keylist.indexOf(unblockDuration) < 0 && (typeof unblockDuration === 'string' && unblockDuration.trim() !== '')) {
				this.value(unblockDuration, unblockDuration + ' ' + _('(minutes)'));
				sortList(this);
			}
			return unblockDuration;
		};

		o.renderWidget = function (section_id, option_index, cfgvalue) {
			const value = (cfgvalue != null) ? cfgvalue : this.default;
			const choices = this.transformChoices();
			const placeholder = (this.optional || this.rmempty) ? E('em', _('unspecified')) : _('-- Please choose --');
			let widget = new ui.Combobox(Array.isArray(value) ? value.join(' ') : value, choices, {
				id: this.cbid(section_id),
				sort: this.keylist,
				optional: this.optional || this.rmempty,
				datatype: this.datatype,
				select_placeholder: this.placeholder ?? placeholder,
				validate: L.bind(this.validate, this, section_id),
				disabled: (this.readonly != null) ? this.readonly : this.map.readonly,
				create_markup: '<li data-value="{{value}}">' + '{{value}}' + ' ' + _('(minutes)') + '</span>' + '</li>'
			});
			return widget.render();
		}

		fwtool.addMACOption(s, 'general', 'macaddrlist', _('Client MAC'), null, hosts);

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

		o = s.taboption('timed', form.DynamicList, 'timerangelist', _('Time Ranges'), _('Example') + ': ' + '00:00:00-23:59:59');
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