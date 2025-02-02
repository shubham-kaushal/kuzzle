/*
 * Kuzzle, a backend software, self-hostable and ready to use
 * to power modern apps
 *
 * Copyright 2015-2022 Kuzzle
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

/**
 * Policy Restiction definition of
 * a index and its collections
 * 
 * @example
 * {
 *   "index": "index-yellow-taxi",
 *   "collections": ["foo", "bar"]
 * }
 */
export type PolicyRestrictions = {
  index: string,
  collections: string[],
};

/**
 * @internal
 * A policy definition
 * the key {string} represent the index name
 * the value {string[]} represent the collection names
 */
export type OptimizedPolicyRestrictions = Map<string, string[]>;
