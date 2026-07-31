import React, { useState } from 'react';
import { HIGList, HIGListSection, HIGListRow } from '../components/ui/HIGList';
import { HIGSwitch } from '../components/ui/HIGSwitch';
import { HIGSegmentedControl } from '../components/ui/HIGSegmentedControl';
import { HIGButton } from '../components/ui/HIGButton';
import { HIGSheet } from '../components/ui/HIGSheet';
import { HIGAlert } from '../components/ui/HIGAlert';
import { SFIcon } from '../components/ui/SFIcon';

const HIGDemoPage: React.FC = () => {
  const [wifiEnabled, setWifiEnabled] = useState(true);
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false);
  const [airplaneMode, setAirplaneMode] = useState(false);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isAlertOpen, setIsAlertOpen] = useState(false);

  return (
    <div className="mx-auto max-w-2xl pb-12">
      <div className="mb-6 px-4">
        <h1 className="sf-large-title text-ios-label font-bold mb-2">Apple HIG Demo</h1>
        <p className="sf-body text-ios-label-secondary">
          This page tests the new iOS 17+ components and typography.
        </p>
      </div>

      <div className="mb-8 px-4">
        <HIGSegmentedControl
          segments={['List View', 'Components', 'Sheets & Alerts']}
          selectedIndex={segmentIndex}
          onChange={setSegmentIndex}
        />
      </div>

      {segmentIndex === 0 && (
        <HIGList>
          <HIGListSection header="Connectivity" footer="Airplane Mode disables all wireless interfaces.">
            <HIGListRow
              icon={<SFIcon name="airplane" color="white" />}
              label="Airplane Mode"
              accessory="switch"
              switchChecked={airplaneMode}
              onSwitchChange={setAirplaneMode}
            />
            <HIGListRow
              icon={<SFIcon name="wifi" color="white" />}
              label="Wi-Fi"
              detail="MyNetwork_5G"
              accessory="chevron"
              onPress={() => console.log('Wi-Fi pressed')}
            />
            <HIGListRow
              icon={<SFIcon name="bluetooth" color="white" />}
              label="Bluetooth"
              detail={bluetoothEnabled ? 'On' : 'Off'}
              accessory="chevron"
              onPress={() => setBluetoothEnabled(!bluetoothEnabled)}
            />
          </HIGListSection>

          <HIGListSection header="Actions">
            <HIGListRow
              label="Check for Updates"
              accessory="chevron"
              onPress={() => console.log('Update')}
            />
            <HIGListRow
              label="Reset Settings"
              destructive
              onPress={() => setIsAlertOpen(true)}
            />
          </HIGListSection>
        </HIGList>
      )}

      {segmentIndex === 1 && (
        <div className="px-4 space-y-6">
          <div>
            <h2 className="sf-title2 text-ios-label mb-3">Buttons</h2>
            <div className="space-y-3">
              <HIGButton variant="filled" fullWidth>Filled Button</HIGButton>
              <HIGButton variant="tinted" fullWidth>Tinted Button</HIGButton>
              <HIGButton variant="gray" fullWidth>Gray Button</HIGButton>
              <HIGButton variant="plain" fullWidth>Plain Button</HIGButton>
              <HIGButton variant="destructive" fullWidth>Destructive Button</HIGButton>
            </div>
          </div>
          
          <div>
            <h2 className="sf-title2 text-ios-label mb-3">Typography</h2>
            <div className="space-y-2 bg-ios-grouped-secondary p-4 rounded-ios-lg">
              <div className="sf-large-title text-ios-label">Large Title</div>
              <div className="sf-title1 text-ios-label">Title 1</div>
              <div className="sf-title2 text-ios-label">Title 2</div>
              <div className="sf-title3 text-ios-label">Title 3</div>
              <div className="sf-headline text-ios-label">Headline</div>
              <div className="sf-body text-ios-label">Body</div>
              <div className="sf-callout text-ios-label">Callout</div>
              <div className="sf-subhead text-ios-label">Subhead</div>
              <div className="sf-footnote text-ios-label">Footnote</div>
              <div className="sf-caption1 text-ios-label">Caption 1</div>
              <div className="sf-caption2 text-ios-label">Caption 2</div>
            </div>
          </div>
        </div>
      )}

      {segmentIndex === 2 && (
        <div className="px-4 space-y-6">
          <HIGButton variant="filled" fullWidth onClick={() => setIsSheetOpen(true)}>
            Open Bottom Sheet
          </HIGButton>
          <HIGButton variant="tinted" fullWidth onClick={() => setIsAlertOpen(true)}>
            Open Alert
          </HIGButton>
        </div>
      )}

      {/* Overlays */}
      <HIGSheet
        isOpen={isSheetOpen}
        onClose={() => setIsSheetOpen(false)}
        title="Sheet Title"
        leadingAction={{ label: 'Annulla', onPress: () => setIsSheetOpen(false) }}
        trailingAction={{ label: 'Done', onPress: () => setIsSheetOpen(false), bold: true }}
      >
        <div className="pt-4 pb-8">
          <p className="sf-body text-ios-label mb-4 px-4">This is a native-feeling bottom sheet.</p>
          <HIGList>
            <HIGListSection>
              <HIGListRow label="Option 1" accessory="checkmark" onPress={() => {}} />
              <HIGListRow label="Option 2" onPress={() => {}} />
            </HIGListSection>
          </HIGList>
        </div>
      </HIGSheet>

      <HIGAlert
        isOpen={isAlertOpen}
        title="Reset All Settings"
        message="Sei sicuro di voler riportare tutte le impostazioni ai valori di fabbrica? Questa azione è irreversibile."
        actions={[
          { label: 'Reset', style: 'destructive', onPress: () => setIsAlertOpen(false) },
          { label: 'Annulla', style: 'cancel', onPress: () => setIsAlertOpen(false) }
        ]}
      />
    </div>
  );
};

export default HIGDemoPage;
