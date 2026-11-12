<script setup lang="ts">
// Ported from legacy/src/app/(settings)/settings/inbox/page.tsx.
definePageMeta({ layout: 'dashboard', nav: 'settings' })
const { t } = useLanguage()
</script>

<template>
  <SettingsMailSettingsPage id="settings-inbox" :title="t('settings.nav.inbox')">
    <SettingsMailSettingsSection :title="t('settingsPage.inbox.experience')" :description="t('settingsPage.inbox.experienceDescription')">
      <SettingsMailSettingsSubsection :title="t('settingsPage.inbox.appearance')" :description="t('settingsPage.inbox.appearanceDescription')">
        <SettingsMailAppearanceSettings />
      </SettingsMailSettingsSubsection>
      <SettingsMailSettingsSubsection :title="t('settingsPage.inbox.readingLayout')" :description="t('settingsPage.inbox.readingLayoutDescription')">
        <SettingsMailReadingLayoutSettings />
      </SettingsMailSettingsSubsection>
      <SettingsMailSettingsSubsection :title="t('settingsPage.inbox.threading')" :description="t('settingsPage.inbox.threadingDescription')">
        <SettingsMailThreadingSettings />
      </SettingsMailSettingsSubsection>
      <SettingsMailSettingsSubsection :title="t('settingsPage.inbox.addresses')" :description="t('settingsPage.inbox.addressesDescription')">
        <SettingsMailRecipientAddressSettings />
      </SettingsMailSettingsSubsection>
      <SettingsMailSettingsSubsection :title="t('settingsPage.inbox.compose')" :description="t('settingsPage.inbox.composeDescription')">
        <SettingsMailComposeDefaultsSettings />
      </SettingsMailSettingsSubsection>
      <SettingsMailSettingsSubsection :title="t('settingsPage.inbox.shortcuts')" :description="t('settingsPage.inbox.shortcutsDescription')">
        <SettingsMailShortcutsSettings />
      </SettingsMailSettingsSubsection>
      <SettingsMailSettingsSubsection :title="t('settingsPage.inbox.notifications')" :description="t('settingsPage.inbox.notificationsDescription')">
        <div class="space-y-4">
          <SettingsMailBrowserNotificationSettings />
          <SettingsMailPushNotificationSettings />
        </div>
      </SettingsMailSettingsSubsection>
    </SettingsMailSettingsSection>

    <SettingsMailSettingsSection :title="t('settingsPage.inbox.handling')" :description="t('settingsPage.inbox.handlingDescription')">
      <SettingsMailSettingsSubsection :title="t('settingsPage.inbox.spamProtection')" :description="t('settingsPage.inbox.spamProtectionDescription')">
        <SettingsMailSpamFilterSettings />
      </SettingsMailSettingsSubsection>
      <SettingsMailSettingsSubsection :title="t('settingsPage.inbox.remoteContent')" :description="t('settingsPage.inbox.remoteContentDescription')">
        <SettingsMailRemoteContentSettings />
      </SettingsMailSettingsSubsection>
      <SettingsMailSettingsSubsection :title="t('settingsPage.inbox.cleanup')" :description="t('settingsPage.inbox.cleanupDescription')">
        <SettingsMailTrashRetentionSettings />
      </SettingsMailSettingsSubsection>
      <SettingsMailSettingsSubsection :title="t('settingsPage.inbox.autoReply')" :description="t('settingsPage.inbox.autoReplyDescription')">
        <SettingsMailAutoReplyForm />
      </SettingsMailSettingsSubsection>
    </SettingsMailSettingsSection>
  </SettingsMailSettingsPage>
</template>
