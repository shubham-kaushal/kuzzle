/*
 * Kuzzle, a backend software, self-hostable and ready to use
 * to power modern apps
 *
 * Copyright 2015-2020 Kuzzle
 * mailto: support AT kuzzle.io
 * website: http://kuzzle.io
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

/**
 * @typedef {number} notifyActionEnum
 */

/**
 * Enum for the document's notification "action" option
 * @readOnly
 * @enum {notifyActionEnum}
 */
const actionEnum = Object.freeze({
  CREATE: 1,
  DELETE: 2,
  REPLACE: 3,
  UPDATE: 4,
  UPSERT: 5,
  WRITE: 6, // create or replace
});

module.exports = actionEnum;
