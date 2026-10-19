import { createBrowserTabSync } from './sync';
import { mountApp } from './ui/app';

const root = document.getElementById('app');

if (root) {
  mountApp(root, createBrowserTabSync());
  document.documentElement.classList.add('mounted');
  // Turn on colour transitions only after the first frame, so opening a tab never animates.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.documentElement.classList.add('ready')),
  );
}
