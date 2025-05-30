local o = require "luci.sys"
local a, t, e
a = Map("timecontrol", translate("Internet Time Control"))
a.template = "timecontrol/index"

t = a:section(TypedSection, "basic")
t.anonymous = true

e = t:option(DummyValue, "timecontrol_status", translate("Status"))
e.template = "timecontrol/timecontrol"
e.value = translate("Collecting data...")

e = t:option(Flag, "enable", translate("Enabled"))
e.rmempty = false

t = a:section(TypedSection, "macbind", translate("Client Settings"))
t.template = "cbi/tblsection"
t.anonymous = true
t.addremove = true

e = t:option(Flag, "enable", translate("Enabled"))
e.rmempty = false

e = t:option(DynamicList, "macaddr", "MAC")
e.rmempty = true
o.net.mac_hints(function(t, a)
    e:value(t, "%s (%s)" % {t, a})
end)

e = t:option(Value, "timeon", translate("No Internet start time"))
e.default = "00:00:00"
e.optional = false
e.modalonly = true
e.datatype = "timehhmmss"

e = t:option(Value, "timeoff", translate("No Internet end time"))
e.default = "23:59:59"
e.optional = false
e.modalonly = true
e.datatype = "timehhmmss"

e = t:option(MultiValue, "days", translate("Days of Week"))
e.rmempty = true
e:value("Sunday", translate("Sunday"))
e:value("Monday", translate("Monday"))
e:value("Tuesday", translate("Tuesday"))
e:value("Wednesday", translate("Wednesday"))
e:value("Thursday", translate("Thursday"))
e:value("Friday", translate("Friday"))
e:value("Saturday", translate("Saturday"))

return a
