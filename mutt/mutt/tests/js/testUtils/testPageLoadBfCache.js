/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const BASE_URL = collector.addHttpResource("../../data/");
const TEST_DATA = BASE_URL + "link.html";

var setupModule = function () {
  controller = mozmill.getBrowserController();
}

var testBFCache = function ()  {
  controller.open(TEST_DATA);
  controller.waitForPageLoad();

  var link = findElement.ID(controller.tabs.activeTab, "link");
  link.click();
  controller.waitForPageLoad();

  controller.goBack();
  controller.waitForPageLoad();

  link = findElement.ID(controller.tabs.activeTab, "link");
  link.click();
}
