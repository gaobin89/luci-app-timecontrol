'use strict';
'require view';
'require ui';
'require rpc';
'require poll';
'require uci';
'require form';
'require tools.firewall as fwtool';
'require tools.widgets as widgets';

function rule_macaddrlist_txt(s, hosts) {
	var result = uci.get('timecontrol', s, 'macaddrlist');
	var controlType = uci.get('timecontrol', 'config', 'controlType') || '0';
	if (typeof result === 'string') {
		result = result.toUpperCase();
	} else if (Array.isArray(result)) {
		result = result.map(item => typeof item === 'string' ? item.toUpperCase() : item);
	}
	if (result === null || result === undefined || (typeof result === 'string' && result.trim() === '')) {
		if (controlType === '0') {
			result = _('AllClients');
		} else {
			result = _('unspecified');
		}
	}
	var items = fwtool.map_invert(result);
	return fwtool.fmt(_('%{macaddrlist}'), {
		macaddrlist: formatListWithLineBreaks(items, 1)
	});
}

function rule_timerangelist_txt(s) {
	var result = uci.get('timecontrol', s, 'timerangelist');
	var controlType = uci.get('timecontrol', 'config', 'controlType') || '0';
	if (result === null || result === undefined || (typeof result === 'string' && result.trim() === '')) {
		if (controlType === '0') {
			result = _('AnyTime');
		} else {
			var weekdays = uci.get('timecontrol', s, 'weekdays');
			if (weekdays === null || weekdays === undefined || (typeof weekdays === 'string' && weekdays.trim() === '')) {
				result = _('unspecified');
			} else if (typeof weekdays === 'string') {
				const days = weekdays.trim().split(/\s+/);
				if (days.length === 7) {
					result = _('unspecified');
				} else {
					result = _('AnyTime');
				}
			} else if (Array.isArray(weekdays)) {
				if (weekdays.length === 7) {
					result = _('unspecified');
				} else {
					result = _('AnyTime');
				}
			}
		}
	} else if (Array.isArray(result) && result.indexOf('00:00:00-23:59:59') >= 0) {
		result = _('AnyTime');
	}
	result = sortTimeRanges(result);
	var items = fwtool.map_invert(result);
	return fwtool.fmt(_('%{timerangelist}'), {
		timerangelist: formatListWithLineBreaks(items, 1)
	});
}

function rule_availableDuration_txt(s) {
	var result = uci.get('timecontrol', s, 'timerangelist');
	var duration = getAvailableDuration(result, s);
	return fwtool.fmt(_('%{duration#%{next? }<var>%{item.ival}</var>}'), {
		duration: fwtool.map_invert(duration + ' ' + _('(minutes)'))
	});
}

function rule_Interface_txt(s) {
	var result = uci.get('timecontrol', s, 'interface');
	if (result === null || result === undefined || (typeof result === 'string' && result.trim() === '')) {
		result = _('unspecified');
	}
	return fwtool.fmt(_('%{interface#%{next? }<var>%{item.ival}</var>}'), {
		interface: fwtool.map_invert(result)
	});
}

function rule_temporaryDuration_txt(s) {
	var result = uci.get('timecontrol', s, 'temporaryDuration');
	if (result === null || result === undefined || (typeof result === 'string' && result.trim() === '')) {
		result = '0';
	}
	var controlType = uci.get('timecontrol', s, 'temporaryControl') || 0;
	var statusColor = controlType === '0' ? '#f59e0b' : 'red';
	var tooltipText = controlType === '0' ? _('Temporary Unblock') : _('Temporary Block');
	if (result === '0') {
		return fwtool.fmt(_('%{temporaryDuration#%{next? }<var>%{item.ival}</var>}'), {
			temporaryDuration: fwtool.map_invert(result + ' ' + _('(minutes)'))
		});
	} else {
		var spanTemp = '<var><span style="color:%s" data-tooltip="%s">%s</span></var>';
		var renderHTML = String.format(spanTemp, statusColor, tooltipText, result + ' ' + _('(minutes)'));
		return renderHTML;
	}
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
	} else if (Array.isArray(result)) {
		if (result.length === 7) {
			result = _('AnyDay');
		} else {
			result = result.map(day => weekMap[day] || day).join(' ');
		}
	}

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
	var spanTemp = '<em><span style="color:%s"><strong>%s</strong></span>\t\t<strong>|</strong>\t\t<a href="%s" style="color:%s;"><strong>%s: %d</strong></a></em>';
	var statusColor = res.exists ? '#059669' : 'red';
	var statusText = res.exists ? _('Control Enabled') : _('Control Disabled');
	var ruleCountColor = res.ruleCount > 0 ? '#059669' : '#f59e0b';
	var href = L.hasSystemFeature('firewall4') ? '/cgi-bin/luci/admin/status/nftables' : '/cgi-bin/luci/admin/status/iptables';
	var renderHTML = String.format(spanTemp, statusColor, statusText, href, ruleCountColor, _('Control Rules'), res.ruleCount);
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

function sortTimeRanges(value) {
	let ranges = Array.isArray(value) ? value : (value ? [value] : []);
	ranges = ranges.slice().sort((a, b) => {
		const aStart = a.split('-')[0];
		const bStart = b.split('-')[0];
		return aStart.localeCompare(bStart);
	});
	return ranges;
}

function parseTime(time) {
	if (typeof time !== 'string') return null;
	const timeRegex = /^(\d\d):(\d\d):(\d\d)$/;
	const match = time.match(timeRegex);
	if (!match) return null;
	const [, h, m, s] = match;
	const hours = parseInt(h, 10);
	const minutes = parseInt(m, 10);
	const seconds = parseInt(s, 10);
	if (hours > 23 || minutes > 59 || seconds > 59) return null;
	return hours * 3600 + minutes * 60 + seconds;
}

function getRangeSec(str) {
	const [start, end] = str.split('-');
	return [parseTime(start), parseTime(end)];
}

function validTimeRange(o, section_id, value) {
	function isValidTimeRange(str) {
		const [startSec, endSec] = getRangeSec(str);
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

	const [startSec, endSec] = getRangeSec(value);

	let ranges = o.formvalue(section_id);
	ranges = Array.isArray(ranges) ? ranges : (ranges ? [ranges] : []);

	for (const r of ranges) {
		if (r === value) continue;
		const [rStart, rEnd] = getRangeSec(r);
		if (!(endSec <= rStart || startSec >= rEnd)) {
			return _('Time ranges overlap') + ': ' + value + ' --> ' + r;
		}
	}

	return true;
}

function getAvailableDuration(timeRanges, s) {
	var controlType = uci.get('timecontrol', 'config', 'controlType') || '0';
	if (timeRanges === null || timeRanges === undefined || (typeof timeRanges === 'string' && timeRanges.trim() === '')) {
		if (controlType === '0') {
			return 0;
		} else {
			var weekdays = uci.get('timecontrol', s, 'weekdays');
			if (weekdays === null || weekdays === undefined || (typeof weekdays === 'string' && weekdays.trim() === '')) {
				return 1440;
			} else if (typeof weekdays === 'string') {
				const days = weekdays.trim().split(/\s+/);
				if (days.length === 7) {
					return 1440;
				} else {
					return 0;
				}
			} else if (Array.isArray(weekdays)) {
				if (weekdays.length === 7) {
					return 1440;
				} else {
					return 0;
				}
			}
		}
	} else if (Array.isArray(timeRanges) && (timeRanges.indexOf('00:00:00-23:59:59') >= 0) || (timeRanges.length === 0)) {
		return 0;
	}

	var duration = 86400;
	for (const r of timeRanges) {
		const [rStart, rEnd] = getRangeSec(r);
		duration -= (rEnd - rStart);
	}
	return parseInt(duration / 60, 10);
}

function addTemporaryDurationOption(s, tab, name, label, description, startValue, endValue) {
	var o = s.taboption(tab, form.Value, name, label, description);
	o.modalonly = true;
	o.datatype = 'and(integer,range(' + startValue + ',' + endValue + '))';
	for (var i = startValue; i <= 5; i++) {
		o.value(i * 5, i * 5 + ' ' + _('(minutes)'));
	}
	for (var i = 1; i <= 4; i++) {
		o.value(i * 30, i * 30 + ' ' + _('(minutes)'));
	}
	for (var i = 3; i <= 12; i++) {
		o.value(i * 60, i * 60 + ' ' + _('(minutes)'));
	}
	return o;
}

function addWeekdayOption(s, tab, name, label, description) {
	var o = s.taboption(tab, form.MultiValue, name, label, description);
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
	return o;
}

function addTimeRangeOption(s, tab, name, label, description) {
	var o = s.taboption(tab, form.DynamicList, name, label, description);
	o.modalonly = true;
	//o.default = '00:00:00-23:59:59';
	o.placeholder = 'hh:mm:ss-hh:mm:ss';

	o.cfgvalue = function (section_id) {
		var value = uci.get('timecontrol', section_id, name);
		return sortTimeRanges(value);
	};

	o.write = function (section_id, value) {
		let ranges = sortTimeRanges(value);
		return this.super('write', [section_id, ranges]);
	};

	o.validate = function (section_id, value) {
		return validTimeRange(this, section_id, value);
	};
	return o;
}

var ruleSelectType = '1';
var selectedRules = [];

function getTargetRules(ruleSelectType, selectedRules) {
	var targetRules = [];
	var sections = getUciSections('rule');

	if (sections.length === 0) {
		return targetRules;
	}

	switch (ruleSelectType) {
		case '0':
			targetRules = sections;
			break;
		case '1':
			targetRules = sections.filter(element => {
				var enable = element['enable'];
				return enable === '1';
			});
			break;
		case '2':
			targetRules = sections.filter(element => {
				var enable = element['enable'];
				return enable === undefined || enable === '0';
			});
			break;
		default:
			targetRules = sections.filter(element => {
				var sectionId = element['.name'];
				return selectedRules.indexOf(sectionId) > -1;
			});
			break;
	}
	return targetRules;
}

function setTemporaryDurationOption(object, targetRules, controlType, value) {
	if (targetRules.length === 0) {
		ui.addTimeLimitedNotification(null, E('p', _('Please select at least one rule first')), 3000, 'warning');
		return;
	}
	targetRules.forEach(element => {
		var sectionId = element['.name'];
		uci.set('timecontrol', sectionId, 'temporaryControl', controlType);
		uci.set('timecontrol', sectionId, 'temporaryDuration', value);
	});
	object.map.save(null, true);
	ui.changes.apply(true);
}

// 兼容性处理：如果 form.RichListValue 不存在则自定义
if (typeof form.RichListValue !== 'function') {
	const CBIRichListValue = form.ListValue.extend({
		__name__: 'CBI.RichListValue',
		__init__() {
			this.super('__init__', arguments);
			this.widget = 'select';
			this.orientation = 'horizontal';
			this.deplist = [];
		},
		renderWidget(section_id, option_index, cfgvalue) {
			const choices = this.transformChoices();
			const widget = new ui.Dropdown((cfgvalue != null) ? cfgvalue : this.default, choices, {
				id: this.cbid(section_id),
				size: this.size,
				sort: this.keylist,
				widget: this.widget,
				optional: this.optional,
				orientation: this.orientation,
				select_placeholder: this.select_placeholder || this.placeholder,
				custom_placeholder: this.custom_placeholder || this.placeholder,
				validate: L.bind(this.validate, this, section_id),
				disabled: (this.readonly != null) ? this.readonly : this.map.readonly
			});
			return widget.render();
		},
		value(value, title, description) {
			if (description) {
				form.ListValue.prototype.value.call(this, value, E([], [
					E('span', { 'class': 'hide-open' }, [title]),
					E('div', { 'class': 'hide-close', 'style': 'min-width:25vw' }, [
						E('strong', [title]), E('br'),
						E('span', { 'style': 'white-space:normal' }, description)
					])
				]));
			} else {
				form.ListValue.prototype.value.call(this, value, title);
			}
		}
	});
	form.RichListValue = CBIRichListValue;
}

// 兼容性处理：如果 ui.addTimeLimitedNotification 不存在则自定义
if (typeof ui.addTimeLimitedNotification !== 'function') {
	function addTimeLimitedNotification(title, children, timeout, ...classes) {
		const msg = ui.addNotification(title, children, ...classes);
		function fadeOutNotification(element) {
			if (element) {
				element.classList.add('fade-out');
				element.classList.remove('fade-in');
				setTimeout(() => {
					if (element.parentNode) {
						element.parentNode.removeChild(element);
					}
				}
				);
			}
		}
		if (typeof timeout === 'number' && timeout > 0) {
			setTimeout(() => fadeOutNotification(msg), timeout);
		}
		return msg;
	};
	ui.addTimeLimitedNotification = addTimeLimitedNotification;
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
		if (fwtool.checkLegacySNAT()) {
			return fwtool.renderMigration();
		}
		else {
			return this.renderRules(data);
		}
	},

	renderRules: function (data) {
		var hosts = data[0],
			m, s, o;

		m = new form.Map('timecontrol', _('Internet Time Control'), _('Users can limit Internet usage time by MAC address, support iptables/nftables IPv4/IPv6') + '<br/>' +
			_('Suggestion and feedback') + ": " + "<a href='https://github.com/gaobin89/luci-app-timecontrol.git' target='_blank'>GitHub @gaobin89/luci-app-timecontrol</a>");

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
		};

		s = m.section(form.NamedSection, 'config', _('Global Settings'));
		s.anonymous = true
		s.addremove = false

		s.tab('global', _('Global Settings'));
		s.tab('restriction', _('Interface Restrictions'));
		s.tab('quick', _('Quick Settings'));

		o = s.taboption('global', form.Flag, 'enable', _('Enable'));
		o.default = o.disabled;
		o.rmempty = false;

		o.onchange = function (ev, section_id, value) {
			uci.set('timecontrol', section_id, 'enable', value);
			uci.save();
		};

		o = s.taboption('global', form.RichListValue, 'controlType', _('Control Type'), _('Set control type to blacklist or whitelist'));
		o.modalonly = true;
		o.default = '0';
		o.value('0', _('Blacklist'), _('Blocks network access only from blacklisted addresses'));
		o.value('1', _('Whitelist'), _('Allow network access only from whitelisted addresses, for more settings go to \"Interface Restrictions\" tab'));

		o.onchange = function (ev, section_id, value) {
			uci.set('timecontrol', section_id, 'controlType', value);
			uci.save();
		};

		o = s.taboption('restriction', widgets.DeviceSelect, 'rejectInterface', _('Interface'), _('The interface is only rejected in whitelist mode, unspecified means reject all interfaces'));
		o.depends('controlType', '1');
		o.nocreate = true;
		o.modalonly = true;
		o.unspecified = true;
		o.multiple = true;

		o.onchange = function (ev, section_id, value) {
			uci.set('timecontrol', section_id, 'rejectInterface', value);
			uci.save();
		};

		o = addWeekdayOption(s, 'restriction', 'weekdays', _('Week Days'));
		o.depends('controlType', '1');

		o.onchange = function (ev, section_id, value) {
			uci.set('timecontrol', section_id, 'weekdays', value);
			uci.save();
		};

		o = addTimeRangeOption(s, 'restriction', 'timerangelist', _('Time Ranges'), _('Example') + ': ' + '00:00:00-10:00:00,11:00:00-13:59:59');
		o.depends('controlType', '1');

		o.onchange = function (ev, section_id, value) {
			if (Array.isArray(value)) {
				if (value.length === 0) {
					uci.set('timecontrol', section_id, 'timerangelist', '');
				} else {
					uci.set('timecontrol', section_id, 'timerangelist', value);
				}
			}
			uci.save();
		};

		o = s.taboption('quick', form.RichListValue, 'ruleSelectType', _('Target Rules'));
		o.modalonly = true;
		o.default = '1';
		o.value('0', _('All Rules'), _('Choose all rules'));
		o.value('1', _('Enabled Rules'), _('Choose all enabled rules'));
		o.value('2', _('Disabled Rules'), _('Choose all disabled rules'));
		o.value('3', _('Manually Choose'), _('Manually Choose rules'));

		o.onchange = function (ev, section_id, value) {
			ruleSelectType = value;
		};

		o.write = function (section_id, value) {
			return true;
		};

		o = s.taboption('quick', form.MultiValue, 'selectedRules', ' ');
		o.display = 2;
		o.modalonly = true;
		o.multiple = true;
		o.depends('ruleSelectType', '3');

		(function () {
			var sections = getUciSections('rule');
			if (sections.length > 0) {
				sections.forEach(element => {
					var sectionId = element['.name'];
					if (sectionId) {
						var ruleName = element['name'] || '';
						if (ruleName === null || ruleName === undefined || (typeof ruleName === 'string' && ruleName.trim() === '')) {
							o.value(sectionId, _('Unnamed rule') + ' (' + sectionId + ')');
						} else {
							o.value(sectionId, ruleName + ' (' + sectionId + ')');
						}
					}
				});
			} else {
				// 关键修复：添加占位值避免 Object.keys 报错
				o.value('_placeholder_', _('No rules available'));
				o.description = _('Please add rules first and refresh the page');
				o.optional = false;
				o.rmempty = true;
				o.readonly = true;
				o.default = '_placeholder_';
			}
		})();

		o.onchange = function (ev, section_id, value) {
			selectedRules = value;
		};

		o.write = function (section_id, value) {
			return true;
		};

		o = addTemporaryDurationOption(s, 'quick', 'blockDuration', _('Temporary Block'), _('Set block duration for selected rules'), 0, 720);

		o.write = function (section_id, value) {
			return true;
		};

		o.onchange = function (ev, section_id, value) {
			/* this.map.save(null, true).then(function () {
				ui.addTimeLimitedNotification(null, E('p', _('Set temporary block duration for all rules successfully')), 3000, 'success');
			});
			this.map.reset();
			location.reload(); */
			var targetRules = getTargetRules(ruleSelectType, selectedRules);
			setTemporaryDurationOption(this, targetRules, 1, value);
		};

		o = addTemporaryDurationOption(s, 'quick', 'unblockDuration', _('Temporary Unblock'), _('Set unblock duration for selected rules'), 0, 720);

		o.write = function (section_id, value) {
			return true;
		};

		o.onchange = function (ev, section_id, value) {
			var targetRules = getTargetRules(ruleSelectType, selectedRules);
			setTemporaryDurationOption(this, targetRules, 0, value);
		};

		s = m.section(form.GridSection, 'rule', _('Control Rules'));
		s.addremove = true;
		s.anonymous = true;
		s.sortable = true;
		s.cloneable = true;

		s.tab('general', _('General Settings'));
		s.tab('timed', _('Time Restrictions'));
		s.tab('other', _('Other Settings'));

		s.sectiontitle = function (section_id) {
			var ruleName = uci.get('timecontrol', section_id, 'name');
			if (ruleName === null || ruleName === undefined || (typeof ruleName === 'string' && ruleName.trim() === '')) {
				return _('Unnamed rule') + ' (' + section_id + ')';
			}
			return ruleName + ' (' + section_id + ')';
		};

		o = s.option(form.Flag, 'enable', _('Enable'));
		o.modalonly = false;
		o.default = o.disabled;
		o.editable = true;

		o.onchange = function (ev, section_id, value) {
			uci.set('timecontrol', section_id, 'enable', value);
			uci.save();
		};

		o = s.option(form.Value, '', _('Temporary Unblock/Block'));
		o.modalonly = false;

		o.textvalue = function (s) {
			return rule_temporaryDuration_txt(s);
		};

		o = s.option(form.Value, '', _('Client MAC'));
		o.modalonly = false;

		o.textvalue = function (s) {
			return rule_macaddrlist_txt(s, hosts);
		};

		o = s.option(form.Value, '', _('Time Ranges'));
		o.modalonly = false;

		o.textvalue = function (s) {
			return rule_timerangelist_txt(s);
		};

		o = s.option(form.Value, '', _('Available Duration'));
		o.modalonly = false;

		o.textvalue = function (s) {
			return rule_availableDuration_txt(s);
		};

		o = s.option(form.Value, '', _('Week Days'));
		o.modalonly = false;

		o.textvalue = function (s) {
			return rule_weekdays_txt(s);
		};

		o = s.option(form.Value, '', _('Interface'));
		o.modalonly = false;

		o.textvalue = function (s) {
			return rule_Interface_txt(s);
		};

		o = s.taboption('general', form.Flag, 'enable', _('Enable'));
		o.modalonly = true;
		o.default = o.disabled;
		o.editable = true;

		o = s.taboption('general', form.Value, 'name', _('Name'));
		o.placeholder = _('Unnamed rule');
		o.modalonly = true;

		o.write = function (section_id, value) {
			return this.super('write', [section_id, value.trim()]);
		};

		o = s.taboption('general', widgets.DeviceSelect, 'interface', _('Interface'));
		o.nocreate = true;
		o.modalonly = true;
		o.unspecified = true;

		fwtool.addMACOption(s, 'general', 'macaddrlist', _('Client MAC'), null, hosts);

		addWeekdayOption(s, 'timed', 'weekdays', _('Week Days'));

		addTimeRangeOption(s, 'timed', 'timerangelist', _('Time Ranges'), _('Example') + ': ' + '00:00:00-10:00:00,11:00:00-13:59:59');

		o = s.taboption('other', form.RichListValue, 'temporaryControl', _('Temporary Control'));
		o.modalonly = true;
		o.default = '0';
		o.value('0', _('Temporary Unblock'));
		o.value('1', _('Temporary Block'));

		o = addTemporaryDurationOption(s, 'other', 'temporaryDuration', _('Temporary Duration'),
			_('When the temporary duration timer ends, it will automatically take effect according to the original rules'), 1, 720);

		o.cfgvalue = function (section_id) {
			var value = uci.get('timecontrol', section_id, 'temporaryDuration');
			var temporaryDuration = value == 0 ? null : value;
			if (this.keylist.indexOf(temporaryDuration) < 0 && (typeof temporaryDuration === 'string' && temporaryDuration.trim() !== '')) {
				this.value(temporaryDuration, temporaryDuration + ' ' + _('(minutes)'));
				sortList(this);
			}
			return temporaryDuration;
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
		};

		return m.render();
	}
});