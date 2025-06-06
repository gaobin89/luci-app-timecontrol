#!/bin/sh

interface=$(
    . /lib/functions/network.sh

    network_is_up "lan" && network_get_device device "lan"
    echo "${device:-br-lan}"
)

reset_rulePosition() {
    enable=$(uci get timecontrol.@basic[0].enable 2>/dev/null)

    if [ -z "$enable" ] || [ "$enable" != "1" ]; then
        exit 0
    fi

    FW4=$(command -v fw4 2>/dev/null)

    if [ -z "$FW4" ]; then
        set_iptables iptables
        set_iptables ip6tables
    else
        first_rule=$(nft list chain inet fw4 forward | sed -n '4p' | grep -E 'timecontrol_reject')
        if [ -z "$first_rule" ]; then
            handles=$(nft -a list chain inet fw4 forward | grep 'timecontrol_reject' | awk '{print $NF}')
            for handle in $handles; do
                nft delete rule inet fw4 forward handle $handle
            done
            nft "insert rule inet fw4 forward iifname \"${interface}\" counter jump timecontrol_reject comment \"!fw4: Time control\" "
            logger -t timecontrol_watchdog "Reset timecontrol_reject rule position to first (fw4)"
        fi
    fi
}

set_iptables() {
    ipt=$(command -v $1 2>/dev/null)

    [ -z "$ipt" ] && return 1

    first_rule=$($ipt -w 1 -t filter -S FORWARD | sed -n '2p')
    echo "$first_rule" | grep -q "TIMECONTROL_REJECT"
    if [ $? -ne 0 ]; then
        while $ipt -w 1 -t filter -C FORWARD -j TIMECONTROL_REJECT -i $interface 2>/dev/null; do
            $ipt -w 1 -t filter -D FORWARD -j TIMECONTROL_REJECT -i $interface >/dev/null 2>&1
        done
        $ipt -w 1 -t filter -I FORWARD -j TIMECONTROL_REJECT -i $interface >/dev/null 2>&1
        logger -t timecontrol_watchdog "Reset TIMECONTROL_REJECT rule position to first (fw3: $ipt)"
    fi
}

if [ "$1" = "loop" ]; then
    while true; do
        reset_rulePosition
        sleep 60
    done
else
    reset_rulePosition
fi
