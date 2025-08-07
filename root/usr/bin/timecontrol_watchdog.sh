#!/bin/sh

. $IPKG_INSTROOT/lib/functions.sh

TIMECONTROL_ENABLE=0
IsUpdate=0
FW4=$(command -v fw4 2>/dev/null)

interface=$(
    . /lib/functions/network.sh

    network_is_up "lan" && network_get_device device "lan"
    echo "${device:-br-lan}"
)

reset_rulePosition() {
    if [ $TIMECONTROL_ENABLE -ne 1 ]; then
        exit 0
    fi

    if [ -z "$FW4" ]; then
        set_iptables iptables
        set_iptables ip6tables
    else
        set_nftables
    fi
}

set_nftables() {
    for chain in forward dstnat; do
        local jumpChain
        case $chain in
        forward)
            jumpChain="timecontrol_forward_reject"
            ;;
        dstnat)
            jumpChain="timecontrol_dstnat_accept"
            ;;
        *) ;;
        esac

        first_rule=$(nft list chain inet fw4 $chain | sed -n '4p' | grep -E "$jumpChain")
        if [ -z "$first_rule" ]; then
            handles=$(nft -a list chain inet fw4 $chain | grep "$jumpChain" | awk '{print $NF}')
            for handle in $handles; do
                nft delete rule inet fw4 $chain handle $handle 2>/dev/null
            done
            nft "insert rule inet fw4 $chain iifname \"${interface}\" counter jump "$jumpChain" comment \"!fw4: Time control\" " 2>/dev/null
            logger -t timecontrol_watchdog "Reset timecontrol rule position to first (chain: $chain)"
        fi
    done
}

set_iptables() {
    ipt=$(command -v $1 2>/dev/null)

    [ -z "$ipt" ] && return 1

    for table in filter nat; do
        local chain jumpChain

        case $table in
        filter)
            chain="FORWARD"
            jumpChain="timecontrol_forward_reject"
            ;;
        nat)
            chain="PREROUTING"
            jumpChain="timecontrol_dstnat_accept"
            ;;
        *) ;;
        esac

        first_rule=$($ipt -w 1 -t $table -S $chain | sed -n '2p')
        echo "$first_rule" | grep -q $jumpChain
        if [ $? -ne 0 ]; then
            while $ipt -w 1 -t $table -C $chain -i $interface -j $jumpChain 2>/dev/null; do
                $ipt -w 1 -t $table -D $chain -i $interface -j $jumpChain 2>/dev/null
            done
            $ipt -w 1 -t $table -I $chain -i $interface -j $jumpChain 2>/dev/null
            logger -t timecontrol_watchdog "Reset timecontrol rule position to first (cmd: $ipt, table: $table, chain: $chain)"
        fi
    done
}

timecontrol_header() {
    config_get TIMECONTROL_ENABLE "$1" enable 0
}

update_ruleUnblockDuration() {
    local enable macaddrlist timerangelist weekdays unblockDuration

    config_get enable "$1" enable 0
    config_get macaddrlist "$1" macaddrlist
    config_get timerangelist "$1" timerangelist "00:00:00-23:59:59"
    config_get weekdays "$1" weekdays "Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday"
    config_get unblockDuration "$1" unblockDuration 0

    if [ $unblockDuration -le 0 ]; then
        return 0
    fi

    if [ -z "${timerangelist}" ]; then
        timerangelist="00:00:00-23:59:59"
    fi
    if [ -z "${weekdays}" ]; then
        weekdays="Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday"
    else
        weekdays=$(echo "$weekdays" | sed 's/ /,/g')
    fi

    unblockDuration=$(expr $unblockDuration - 1)
    if [ $unblockDuration -gt 0 ]; then
        uci set timecontrol.$1.unblockDuration=$unblockDuration
        logger -t timecontrol_watchdog "Update timecontrol rule's unblock duration to $unblockDuration (MAC: ${macaddrlist}, Time: ${timerangelist}, Days: ${weekdays}) "
    else
        IsUpdate=1
        uci delete timecontrol.$1.unblockDuration
    fi
    uci commit timecontrol

}

update_unblockDuration() {
    IsUpdate=0

    if [ $TIMECONTROL_ENABLE -eq 1 ]; then
        config_foreach update_ruleUnblockDuration rule
    fi

    if [ $IsUpdate -eq 1 ]; then
        /etc/init.d/timecontrol restart >/dev/null 2>&1
    fi
}

start() {
    while true; do
        sleep 60
        config_load timecontrol
        config_foreach timecontrol_header basic
        update_unblockDuration
        reset_rulePosition
    done
}

start
