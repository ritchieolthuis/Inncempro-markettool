/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-5d155c7a'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "123fed109c95b6539df97f9415adb80e"
  }, {
    "url": "manifest.webmanifest",
    "revision": "5ec71ae60d716ffb2503afca8a161dfc"
  }, {
    "url": "logo-header.png",
    "revision": "77de9ae56cb5dff9abab29d14ba3cc49"
  }, {
    "url": "index.html",
    "revision": "50b4d95817f77860b16f76ffb44ea883"
  }, {
    "url": "icon-maskable-512.png",
    "revision": "aafb99953f9a01fa18ee7d4cfc99a645"
  }, {
    "url": "icon-512.png",
    "revision": "4a56e55cfc10ff8ba96756940dcc9673"
  }, {
    "url": "icon-192.png",
    "revision": "a03f76facabf13d8051c1bdb1ebe9aee"
  }, {
    "url": "icon-1024.png",
    "revision": "019295de80d1aa0420c52e27b9225675"
  }, {
    "url": "favicon.ico",
    "revision": "8a09960e5e25083d29629053495df4ac"
  }, {
    "url": "favicon-32.png",
    "revision": "281e03a328d57236e7c71b5d07f48003"
  }, {
    "url": "favicon-16.png",
    "revision": "32cc037009d5d2975e557a4bc8c94cab"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "0214a924cfd2a2be5adb183f567e37c5"
  }, {
    "url": "assets/index-BohcJeZH.js",
    "revision": null
  }, {
    "url": "assets/index-1pyp3sTK.css",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "0214a924cfd2a2be5adb183f567e37c5"
  }, {
    "url": "favicon-16.png",
    "revision": "32cc037009d5d2975e557a4bc8c94cab"
  }, {
    "url": "favicon-32.png",
    "revision": "281e03a328d57236e7c71b5d07f48003"
  }, {
    "url": "favicon.ico",
    "revision": "8a09960e5e25083d29629053495df4ac"
  }, {
    "url": "icon-192.png",
    "revision": "a03f76facabf13d8051c1bdb1ebe9aee"
  }, {
    "url": "icon-512.png",
    "revision": "4a56e55cfc10ff8ba96756940dcc9673"
  }, {
    "url": "icon-maskable-512.png",
    "revision": "aafb99953f9a01fa18ee7d4cfc99a645"
  }, {
    "url": "logo-header.png",
    "revision": "77de9ae56cb5dff9abab29d14ba3cc49"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/mt1\.google\.com\/vt\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-maps-tiles",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 4000,
      maxAgeSeconds: 2592000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 30,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/wegygdxneeddzfuaixtk\.supabase\.co\/rest\/.*/i, new workbox.NetworkFirst({
    "cacheName": "supabase-data",
    "networkTimeoutSeconds": 4,
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 200,
      maxAgeSeconds: 604800
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/nominatim\.openstreetmap\.org\/.*/i, new workbox.NetworkFirst({
    "cacheName": "nominatim",
    "networkTimeoutSeconds": 4,
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 3000,
      maxAgeSeconds: 2592000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
