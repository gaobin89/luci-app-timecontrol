#!/bin/sh

FW4=$(command -v fw4 2>/dev/null)

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

    if [ -z "$FW4" ]; then
        set_iptables iptables
        set_iptables ip6tables
    else
        local chain
        for chain in forward dstnat; do
            first_rule=$(nft list chain inet fw4 $chain | sed -n '4p' | grep -E 'timecontrol')
            if [ -z "$first_rule" ]; then
                handles=$(nft -a list chain inet fw4 $chain | grep 'timecontrol' | awk '{print $NF}')
                for handle in $handles; do
                    nft delete rule inet fw4 $chain handle $handle 2>/dev/null
                done

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
                nft "insert rule inet fw4 $chain iifname \"${interface}\" counter jump "$jumpChain" comment \"!fw4: Time control\" " 2>/dev/null
            fi
        done
    fi
    logger -t timecontrol_watchdog "Reset timecontrol rule position to first"
}

set_iptables() {
    ipt=$(command -v $1 2>/dev/null)

    [ -z "$ipt" ] && return 1

    local table chain
    for table in filter nat; do

        case $table in
        filter)
            chain="FORWARD"
            ;;
        nat)
            chain="PREROUTING"
            ;;
        *) ;;
        esac

        first_rule=$($ipt -w 1 -t $table -S $chain | sed -n '2p')
        echo "$first_rule" | grep -q "TIMECONTROL"
        if [ $? -ne 0 ]; then
            while $ipt -w 1 -t $table -C $chain -j TIMECONTROL 2>/dev/null; do
                $ipt -w 1 -t $table -D $chain -j TIMECONTROL >/dev/null 2>&1
            done
            $ipt -w 1 -t $table -I $chain -j TIMECONTROL >/dev/null 2>&1
        fi
    done
}

if [ "$1" = "loop" ]; then
    while true; do
        reset_rulePosition
        sleep 60
    done
else
    reset_rulePosition
fi
