# Copyright (C) 2020 Lienol <lawlienol@gmail.com>
#
# This is free software, licensed under the GNU General Public License v3.
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for Time Control
LUCI_PKGARCH:=all
PKG_VERSION:=2.0
PKG_RELEASE:=20250606

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
