local o = require "luci.sys"
local a, t, e
a = Map("timecontrol", translate("Internet Time Control"))
a.description = translate("Users can limit Internet usage time by MAC address, support iptables/nftables IPv4/IPv6") ..
                    "<br/>" .. "Suggestion and feedback: " .. translate(
    "<a href='https://github.com/gaobin89/luci-app-timecontrol.git' target='_blank'>GitHub @gaobin89/luci-app-timecontrol</a>") ..
                    "<br/>" .. "Fork from: " ..
                    translate(
        "<a href='https://github.com/Lienol/openwrt-package.git' target='_blank'>GitHub @Lienol</a>")

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

e = t:option(DynamicList, "macaddrlist", "MAC")
e.rmempty = false
o.net.mac_hints(function(t, a)
    e:value(t, "%s (%s)" % {t, a})
end)

function e.validate(self, value, section)
    local function is_valid_mac(mac)
        return mac:match("^%x%x:%x%x:%x%x:%x%x:%x%x:%x%x$") ~= nil
    end

    if type(value) == "table" then
        if #value == 0 then
            return nil, translate("Please select at least one MAC address")
        end
        for _, v in ipairs(value) do
            if not is_valid_mac(v) then
                return nil, translate("Invalid MAC address: ") .. (v or "")
            end
        end
    elseif type(value) == "string" then
        if value == "" then
            return nil, translate("Please select at least one MAC address")
        end
        if not is_valid_mac(value) then
            return nil, translate("Invalid MAC address: ") .. value
        end
    else
        return nil, translate("Please select at least one MAC address")
    end
    return value
end

e = t:option(DynamicList, "timerangelist", translate("No Internet Time Range"))
e.default = "00:00:00-23:59:59"
e.placeholder = "00:00:00-23:59:59"
e.optional = false
e.modalonly = true

function e.validate(self, value, section)
    local function is_valid_timerange(str)
        local s, e = str:match("^(%d%d:%d%d:%d%d)%-(%d%d:%d%d:%d%d)$")
        if not s or not e then
            return false
        end
        local function to_sec(t)
            local h, m, s = t:match("^(%d%d):(%d%d):(%d%d)$")
            h, m, s = tonumber(h), tonumber(m), tonumber(s)
            if not h or not m or not s then
                return nil
            end
            if h > 23 or m > 59 or s > 59 then
                return nil
            end
            return h * 3600 + m * 60 + s
        end
        local s_sec = to_sec(s)
        local e_sec = to_sec(e)
        if not s_sec or not e_sec then
            return false
        end
        if s_sec >= e_sec then
            return false
        end
        return true
    end

    if type(value) == "table" then
        for _, v in ipairs(value) do
            if not is_valid_timerange(v) then
                return nil, translate("Invalid time range: ") .. (v or "")
            end
        end
    elseif type(value) == "string" then
        if not is_valid_timerange(value) then
            return nil, translate("Invalid time range: ") .. value
        end
    end
    return value
end

e = t:option(Value, "unblockDuration", translate("Temporary Unblock") .. " " .. translate("(minutes)"))
e.optional = false
e.modalonly = true
e.datatype = "uinteger"
e.default = "0"
e.rmempty = true
e:value("0", "0" .. " " .. translate("(minutes)"))
e:value("5", "5" .. " " .. translate("(minutes)"))
e:value("10", "10" .. " " .. translate("(minutes)"))
e:value("15", "15" .. " " .. translate("(minutes)"))
e:value("30", "30" .. " " .. translate("(minutes)"))
e:value("45", "45" .. " " .. translate("(minutes)"))
e:value("60", "60" .. " " .. translate("(minutes)"))
e:value("90", "90" .. " " .. translate("(minutes)"))
e:value("120", "120" .. " " .. translate("(minutes)"))

function e.validate(self, value, section)
    local v = tonumber(value)
    if v and v >= 0 and v <= 720 then
        return value
    end
    return nil, translate("Allowed values: 0 ~ 720 minutes")
end

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
