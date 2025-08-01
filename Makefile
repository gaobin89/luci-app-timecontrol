# Copyright (C) 2025 GaoBin <gaobin89@foxmail.com>
#
# This is free software, licensed under the GNU General Public License v3.
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for Time Control (JavaScript)
LUCI_PKGARCH:=all
PKG_VERSION:=1.0
PKG_RELEASE:=20250801

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
