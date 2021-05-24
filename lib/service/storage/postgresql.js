/*
 * Kuzzle, a backend software, self-hostable and ready to use
 * to power modern apps
 *
 * Copyright 2015-2018 Kuzzle
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

const
  _ = require('lodash'),
  debug = require('../kuzzleDebug')('kuzzle:services:postgresql'),
  Service = require('./service'),
  storageError = require('../util/errors').wrap('services', 'storage'),
  { Client: PGClient } = require('pg');

// Used for collection emulation
const
  INTERNAL_PREFIX = 'KU_I_',
  PUBLIC_PREFIX = 'KU_P_',
  NAME_SEPARATOR = '$';

const notAvailableMethods = [
  'scroll'
];

/**
 * Notes about ES emulation support
 *
 * General:
 *  - try to introduce a new field will throw
 *
 * Collection schema:
 *  - very few allowed caracters in the name
 *  - "-" -> "_"
 *  - es type mapping
 *  - primary key as integer problem
 *  - how to handle indexes on fields
 */

class Postgresql extends Service {
  static buildClient (clientConfig) {
    return new PGClient(clientConfig);
  }

  constructor (kuzzle, config, scope = 'public') {
    super('postgresql', kuzzle, config);

    this._scope = scope;
    this._tablePrefix = scope === 'internal'
      ? INTERNAL_PREFIX
      : PUBLIC_PREFIX;

    this._client = null;
    this._pgVersion = null;
  }

  get scope () {
    return this._scope;
  }

  /**
   * Initializes the postgresql client
   *
   * @override
   * @returns {Promise}
   */
  async _initSequence () {
    if (this._client) {
      return this;
    }

    this._client = Postgresql.buildClient(this._config.client);

    await this._client.connect();

    const result = await this._client.query('SELECT version()');

    this._pgVersion = result.rows[0].version;
  }

  /**
   * Returns some basic information about this service
   * @override
   *
   * @returns {Promise.<Object>} service informations
   */
  async info () {
    return {
      version: this._pgVersion,
      status: 'OK'
    };
  }

  async exists (index, collection, id) {
    const
      pgTable = this._getPgTable(index, collection),
      query = `SELECT exists(SELECT 1 FROM ${pgTable} WHERE _id=$1)`,
      values = [id];

    debug('Exists: %s with %s', query, values);

    const result = await this._client.query(query, values);

    return result.rows[0].exists;
  }

  async get (index, collection, id) {
    const
      pgTable = this._getPgTable(index, collection),
      query = `SELECT * FROM ${pgTable} WHERE _id=$1 LIMIT 1`,
      values = [id];

    debug('Get: %s from %s', id, pgTable);

    const result = await this._client.query(query, values);

    if (result.rows.length === 0) {
      storageError.throw('not_found', id);
    }

    const
      _id = result.rows[0]._id,
      _source = result.rows[0];

    delete _source._id;

    return {
      _id,
      _source
    };
  }

  async delete (index, collection, id) {
    const
      pgTable = this._getPgTable(index, collection),
      query = `DELETE FROM ${pgTable} WHERE _id=$1`,
      values = [id];

    debug('Delete: %s from %s', id, pgTable);

    await this._client.query(query, values);

    return null;
  }

  async createOrReplace (index, collection, id, content) {
    debug('CreateOrReplace: %s with %a', id, content);

    const exists = await this.exists(index, collection, id);

    if (exists) {
      return this.update(index, collection, id, content);
    }

    return this.create(index, collection, content, { id });
  }

  async create (index, collection, content, { id } = {}) {
    const
      pgTable = this._getPgTable(index, collection),
      { query, values } = this._insertQuery(pgTable, content, id);

    debug('Create: %s with %j', query, values);

    const result = await this._client.query(query, values);

    return {
      _id: result.rows[0]._id,
      _source: content
    };
  }

  async update (index, collection, id, content) {
    const
      pgTable = this._getPgTable(index, collection),
      { query, values } = this._updateQuery(pgTable, content, id);

    debug('Update: %s with %j', query, values);

    await this._client.query(query, values);

    return {
      _id: id,
      _source: content
    };
  }

  async createIndex (index) {
    return true;
  }

  async createCollection (index, collection, schema) {
    const
      pgTable = this._getPgTable(index, collection),
      pgSchema = this._adaptSchema(schema),
      idType = _.get(pgSchema, 'id.type', 'varchar(50)');

    const columns = [`_id ${idType} PRIMARY KEY`];
    Object.entries(pgSchema.columns).forEach(([column, { type }]) => {
      columns.push(`${column} ${type}`);
    });
    const query = `CREATE TABLE IF NOT EXISTS ${pgTable}(${columns.join(', ')})`;

    debug('Create collection: %s', query);

    await this._client.query(query);
  }

  async search (index, collection, query, { from, size } = {}) {
    const
      pgTable = this._getPgTable(index, collection);

    debug('Search: %j in %s', query, pgTable);
  }

  async count (index, collection, query) {
    const
      pgTable = this._getPgTable(index, collection);

    debug('Count: %j in %s', query, pgTable);

    return 0;
  }

  async listIndexes () {

  }

  async listCollections (index) {

  }

  _insertQuery (pgTable, content, id = null) {
    const
      values = Object.values(content).map(JSON.stringify),
      columnNames = Object.keys(content);

    if (id) {
      values.unshift(id);
      columnNames.unshift('_id');
    }

    const placeholders = [];
    for (let i = 0; i < columnNames.length; i++) {
      placeholders.push(`$${i + 1}`);
    }

    return {
      query: `INSERT INTO ${pgTable} (${columnNames.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING _id`,
      values
    };
  }

  _updateQuery (pgTable, content, id) {
    const
      values = Object.values(content).map(JSON.stringify),
      columnNames = Object.keys(content);

    values.push(id);

    const setCommands = [];

    for (let i = 0; i < columnNames.length; i++) {
      setCommands.push(`SET ${columnNames[i]} = $${i + 1}`);
    }

    return {
      query: `UPDATE ${pgTable} ${setCommands.join(', ')} WHERE _id = $${columnNames.length + 1}`,
      values
    };
  }

  _getPgTable (index, collection) {
    if (! index || ! collection) {
      return null;
    }

    const pgTable = `${this._tablePrefix}${index}${NAME_SEPARATOR}${collection}`;

    return pgTable.replace(/-/g, '_');
  }

  _adaptSchema (schema) {
    if (schema.columns) {
      return schema;
    }

    const columns = {};

    this._typesReference = {
      keyword: 'varchar(50)',
      boolean: 'boolean',
      text: 'text',
      long: 'bigint'
    };

    Object.entries(schema.properties).forEach(([column, { type }]) => {
      columns[column] = { type: this._typesReference[type] };
    });

    return { columns };
  }
}

for (const method of notAvailableMethods) {
  Postgresql.prototype[method] = () => {
    throw new Error('Not available');
  }
}

module.exports = Postgresql;
