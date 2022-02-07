"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dumpCollectionData = void 0;
const ndjson_1 = __importDefault(require("ndjson"));
const get_1 = __importDefault(require("lodash/get"));
const isObject_1 = __importDefault(require("lodash/isObject"));
const kerror_1 = __importDefault(require("../kerror"));
/**
 * Flatten an object transform:
 * {
 *  title: "kuzzle",
 *  info : {
 *    tag: "news"
 *  }
 * }
 *
 * Into an object like:
 * {
 *  title: "kuzzle",
 *  info.tag: news
 * }
 *
 * @param {Object} target the object we have to flatten
 * @returns {Object} the flattened object
 */
function flattenObject(target) {
    const output = {};
    flattenStep(output, target);
    return output;
}
function flattenStep(output, object, prev = null) {
    const keys = Object.keys(object);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = object[key];
        const newKey = prev ? prev + '.' + key : key;
        if (Object.prototype.toString.call(value) === '[object Object]') {
            output[newKey] = value;
            flattenStep(output, value, newKey);
        }
        output[newKey] = value;
    }
}
/**
 * Extract fields from mapping by removing the properties from es mapping
 *
 * @param mapping
 * @returns
 */
function extractMappingFields(mapping) {
    const newMapping = {};
    for (const key of Object.keys(mapping)) {
        if (key === 'properties' && (0, isObject_1.default)(mapping[key])) {
            newMapping[key] = extractMappingFields(mapping[key]);
        }
        else {
            newMapping[key] = mapping[key];
        }
    }
    return newMapping;
}
/**
 * An iteration-order-safe version of lodash.values
 *
 * @param object The object containing the values
 * @param fields The field names to pick in the right order
 * @returns The values in the same order as the fields
 * @see https://lodash.com/docs/4.17.15#values
 */
function pickValues(object, fields) {
    return fields.map(f => formatValueForCSV((0, get_1.default)(object, f)));
}
/**
 * Formats the value for correct CSV output, avoiding to return
 * values that would badly serialize in CSV.
 *
 * @param value The value to format
 * @returns The value or a string telling the value is not scalar
 */
function formatValueForCSV(value) {
    if ((0, isObject_1.default)(value)) {
        return '[OBJECT]';
    }
    return value;
}
class AbstractDumper {
    constructor(index, collection, batchSize, query = {}, writeStream, dumpOptions) {
        this.index = index;
        this.collection = collection;
        this.batchSize = batchSize;
        this.query = query;
        this.writeStream = writeStream;
        this.dumpOptions = dumpOptions;
        this.options = {
            scroll: '30s',
            size: batchSize
        };
        if (!writeStream) {
            throw kerror_1.default.get('api', 'assert', 'missing_argument', 'writeStream');
        }
    }
    /**
     * One-shot call before the dump. Can be used to
     * perform setup operations before dumping.
     *
     * @returns void
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    async setup() { }
    /**
     * One-shot call before iterating over the data. Can be
     * used to write the header of the dumped output.
     */
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    async writeHeader() { }
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    async tearDown() { }
    async scroll(scrollId) {
        if (!scrollId) {
            return null;
        }
        try {
            return await global.kuzzle.ask('core:storage:public:document:scroll', scrollId, { scrollTTL: this.options.scroll });
        }
        catch {
            return null;
        }
    }
    /**
     * The loop that iterates over the documents of the collection and
     * calls all the other hooks.
     *
     * @returns a promise resolving when the dump is finished.
     */
    async dump() {
        const waitWrite = new Promise((resolve, reject) => this.writeStream ? this.writeStream.on('finish', resolve) : reject());
        this.writeStream.on('error', error => {
            throw error;
        });
        await this.setup();
        await this.writeHeader();
        let results = await global.kuzzle.ask('core:storage:public:document:search', this.index, this.collection, this.query, this.options);
        do {
            for (const hit of results.hits) {
                await this.onResult({
                    _id: hit._id,
                    _source: hit._source
                });
            }
        } while ((results = await this.scroll(results.scrollId)));
        await this.tearDown();
        this.writeStream.end();
        return waitWrite;
    }
}
class JSONLDumper extends AbstractDumper {
    constructor() {
        super(...arguments);
        this.ndjsonStream = ndjson_1.default.stringify();
    }
    async setup() {
        this.ndjsonStream.on('data', (line) => {
            this.writeStream.write(line);
        });
    }
    async writeHeader() {
        await this.writeLine({
            collection: this.collection,
            index: this.index,
            type: 'collection',
        });
    }
    writeLine(content) {
        return new Promise(resolve => {
            if (this.ndjsonStream.write(content)) {
                resolve();
            }
            else {
                this.ndjsonStream.once('drain', resolve);
            }
        });
    }
    onResult(document) {
        return this.writeLine({
            _id: document._id,
            body: document._source,
        });
    }
    get fileExtension() {
        return 'jsonl';
    }
}
class CSVDumper extends AbstractDumper {
    constructor(index, collection, batchSize, query = {}, writeStream, dumpOptions, fields) {
        super(index, collection, batchSize, query, writeStream, dumpOptions);
        this.fields = fields;
        this.separator = ',';
        this.separator = dumpOptions.separator || ',';
    }
    get fileExtension() {
        return 'csv';
    }
    async setup() {
        if (!this.fields.length) {
            // If no field has been selected, then all fields are selected.
            const mappings = await global.kuzzle.ask('core:storage:public:mappings:get', this.index, this.collection);
            if (!mappings.properties) {
                return;
            }
            this.fields = Object.keys(flattenObject(extractMappingFields(mappings.properties)));
        }
        else if (this.fields.includes('_id')) {
            // Delete '_id' from the selected fields, since IDs are
            // _always_ exported.
            this.fields.splice(this.fields.indexOf('_id'), 1);
        }
    }
    writeHeader() {
        return this.writeLine(['_id', ...this.fields].join(this.separator));
    }
    writeLine(content) {
        return new Promise(resolve => {
            if (this.writeStream.write(content)) {
                resolve();
            }
            else {
                this.writeStream.once('drain', resolve);
            }
        });
    }
    onResult(document) {
        const values = [document._id, ...pickValues(document._source, this.fields)];
        return this.writeLine(values.join(this.separator));
    }
}
async function dumpCollectionData(writableStream, index, collection, batchSize, query = {}, format = 'jsonl', fields = [], options = {}) {
    let dumper;
    switch (format.toLowerCase()) {
        case 'csv':
            dumper = new CSVDumper(index, collection, batchSize, query, writableStream, options, fields);
            return dumper.dump();
        default:
            dumper = new JSONLDumper(index, collection, batchSize, query, writableStream, options);
            return dumper.dump();
    }
}
exports.dumpCollectionData = dumpCollectionData;
//# sourceMappingURL=dump-collection.js.map