# Copyright (C) 2025 GaoBin <gaobin89@foxmail.com>
#
# This is free software, licensed under the GNU General Public License v3.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-timecontrol
PKG_VERSION:=2.4.3
PKG_RELEASE:=20260718

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
	SECTION:=luci
	CATEGORY:=LuCI
	SUBMENU:=3. Applications
	TITLE:=LuCI support for Time Control (JavaScript)
	PKGARCH:=all
endef

define Build/Prepare
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	# 安装JavaScript视图文件
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/timecontrol
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/timecontrol/rules.js $(1)/www/luci-static/resources/view/timecontrol/ 2>/dev/null || true
	
	# 安装国际化翻译文件 (i18n)
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/i18n
	po2lmo ./po/zh_Hans/timecontrol.po $(1)/usr/lib/lua/luci/i18n/timecontrol.zh-cn.lmo 2>/dev/null || true
	
	# 安装LuCI菜单注册文件 (menu.d)
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-timecontrol.json $(1)/usr/share/luci/menu.d/ 2>/dev/null || true
	
	# 安装RPC权限控制文件 (acl.d)
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-timecontrol.json $(1)/usr/share/rpcd/acl.d/ 2>/dev/null || true
	
	# 安装防火墙处理脚本
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./root/usr/bin/timecontrol $(1)/usr/bin/ 2>/dev/null || true
	
	# 安装启动脚本
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/init.d/timecontrol $(1)/etc/init.d/ 2>/dev/null || true
	
	# 安装配置文件
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_DATA) ./root/etc/config/timecontrol $(1)/etc/config/ 2>/dev/null || true
	
	# 安装uci-defaults (首次安装脚本)
	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./root/etc/uci-defaults/luci-app-timecontrol $(1)/etc/uci-defaults/ 2>/dev/null || true
endef

define Package/$(PKG_NAME)/prerm
	#!/bin/sh
	if [ -f /etc/config/timecontrol ]; then
		echo "backing up existing configuration..."
		cp -f /etc/config/timecontrol /tmp/timecontrol_backup
	fi
	exit 0
endef

define Package/$(PKG_NAME)/postinst
	#!/bin/sh
	if [ -f /tmp/timecontrol_backup ]; then
		echo "restoring configuration from backup..."
		mv -f /tmp/timecontrol_backup /etc/config/timecontrol
	fi
	/etc/init.d/timecontrol enable >/dev/null 2>&1 || true
	rm -f /tmp/luci-indexcache* 2>/dev/null
	exit 0
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
