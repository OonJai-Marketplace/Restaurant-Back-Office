import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const platform = process.argv[2];
if (platform === 'android') {
  const variables = 'android/variables.gradle'; fs.writeFileSync(variables, fs.readFileSync(variables, 'utf8').replace('minSdkVersion = 24', 'minSdkVersion = 26'));
  const dir = 'android/app/src/main/java/org/oonjai/pos'; fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync('native/android/OonJaiLocalLinkPlugin.java', path.join(dir, 'OonJaiLocalLinkPlugin.java'));
  fs.writeFileSync(path.join(dir, 'MainActivity.java'), `package org.oonjai.pos;\nimport android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;\npublic class MainActivity extends BridgeActivity {\n @Override public void onCreate(Bundle savedInstanceState) { registerPlugin(OonJaiLocalLinkPlugin.class); super.onCreate(savedInstanceState); }\n}\n`);
  const manifest = 'android/app/src/main/AndroidManifest.xml';
  let xml = fs.readFileSync(manifest, 'utf8');
  if (!xml.includes('android.permission.ACCESS_NETWORK_STATE')) xml = xml.replace('</manifest>', '<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" /></manifest>');
  fs.writeFileSync(manifest, xml);
} else if (platform === 'ios') {
  const xcode = require('xcode'), projectPath = 'ios/App/App.xcodeproj/project.pbxproj', project = xcode.project(projectPath); project.parseSync();
  const group = project.findPBXGroupKey({ name: 'App' }) || project.findPBXGroupKey({ path: 'App' });
  for (const name of ['OonJaiLocalLinkPlugin.swift', 'MainViewController.swift']) {
    fs.copyFileSync('native/ios/' + name, 'ios/App/App/' + name);
    if (!project.hasFile(name)) project.addSourceFile(name, { target: project.getFirstTarget().uuid }, group);
  }
  fs.writeFileSync(projectPath, project.writeSync());
  const storyboard = 'ios/App/App/Base.lproj/Main.storyboard';
  fs.writeFileSync(storyboard, fs.readFileSync(storyboard, 'utf8').replace('customClass="CAPBridgeViewController" customModule="Capacitor"', 'customClass="MainViewController" customModule="App" customModuleProvider="target"'));
  const plist = require('plist'), plistPath = 'ios/App/App/Info.plist', info = plist.parse(fs.readFileSync(plistPath, 'utf8'));
  info.NSLocalNetworkUsageDescription = 'Connect the cashier and customer display over your shop Wi-Fi, including when internet is unavailable.';
  info.NSCameraUsageDescription = 'Scan the cashier pairing code to connect this customer display.';
  fs.writeFileSync(plistPath, plist.build(info));
} else throw Error('Choose android or ios');
