const axios = require('axios');

async function main() {
  const response = await axios.get('http://localhost:7512/nyc-open-data/yellow-taxi/_export?format=jsonl');

  console.log(response);
}

main();