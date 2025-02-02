---
code: true
type: page
title: getInteger
description: KuzzleRequest class getInteger() method
---

# getInteger

<SinceBadge version="2.16.9" />

Gets a parameter from a request arguments and checks that it is an integer.
We also support lodash syntax. [(`relations.lebron[0]`)](https://lodash.com/docs/4.17.15#get)

### Arguments

```ts
getInteger (name: string, def: number = null): number
```

</br>

| Name   | Type              | Description    |
|--------|-------------------|----------------|
| `name` | <pre>string</pre> | Parameter name |
| `def` | <pre>number</pre> | Default value to return if the parameter is not set |


### Example

```ts
const age = request.getInteger('age');
// equivalent
const age = request.input.args.age;
//+ checks to make sure that "age" is of the right type
// and throw standard API error when it's not the case
```
