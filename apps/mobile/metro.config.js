/**
 * Metro configuration for the mobile shell.
 *
 * WHY THIS FILE EXISTS
 *
 * This app lives in a pnpm workspace, and pnpm does not hoist transitive
 * packages into a flat `node_modules`. Metro's default resolver walks up from
 * each file and expects to find every package that way; inside `.pnpm/` it
 * cannot, and a native bundle fails on the first transitive import React Native
 * makes — `@react-native/virtualized-lists`, from `FlatList`:
 *
 *   Unable to resolve "@react-native/virtualized-lists" from
 *   node_modules/.pnpm/react-native@0.88.1.../node_modules/react-native/Libraries/Lists/FlatList.js
 *
 * The web bundle never hit this because the web path does not pull FlatList, so
 * `expo export --platform web` passed while the native bundle could not build.
 *
 * The three settings below are Expo's documented monorepo configuration for
 * pnpm-style layouts: watch the workspace root, tell Metro where the two
 * `node_modules` roots are, and stop the hierarchical walk that cannot work
 * inside `.pnpm`.
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;