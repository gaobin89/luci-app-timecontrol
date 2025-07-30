module("luci.controller.timecontrol", package.seeall)

function index()
    if not nixio.fs.access("/etc/config/timecontrol") then
        return
    end

    entry({"admin", "control"}, firstchild(), "Control", 44).dependent = false
    local page = entry({"admin", "control", "timecontrol"}, cbi("timecontrol"), _("Internet Time Control"))
    page.order = 10
    page.dependent = true
    page.acl_depends = {"luci-app-timecontrol"}
    entry({"admin", "control", "timecontrol", "status"}, call("status")).leaf = true
end

function status()
    local e = {}
    local cmd
    if luci.sys.call("command -v nft >/dev/null 2>&1") == 0 then
        cmd = "nft list chain inet fw4 forward | grep timecontrol_forward_reject >/dev/null"
    else
        cmd = "iptables -L FORWARD | grep timecontrol_forward_reject >/dev/null"
    end

    e.status = luci.sys.call(cmd) == 0
    luci.http.prepare_content("application/json")
    luci.http.write_json(e)
end
