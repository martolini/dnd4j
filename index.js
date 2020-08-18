const neo4j = require('neo4j-driver');
const axios = require('axios');
const { uniqBy, flatten } = require('lodash');

const driver = neo4j.driver(
  'neo4j://localhost',
  neo4j.auth.basic('neo4j', 'test')
);

const instance = axios.create({
  baseURL: 'https://www.dnd5eapi.co',
});

async function ingestClasses() {
  const session = await driver.session();
  const response = await instance.get('api/classes');
  const classesRefs = response.data.results;
  const classes = await Promise.all(
    classesRefs.map((ref) => instance.get(ref.url).then((res) => res.data))
  );

  // console.log(JSON.stringify(classes[0], null, 2));

  await session.run(
    `
    UNWIND $classes as class
    UNWIND class.proficiencies as prof
    MERGE (c:Class { url: class.url })
    SET c.name = class.name, c.hit_die = class.hit_die
    MERGE (p:Proficiency { url: prof.url })
    SET p.name = prof.name
    MERGE (c)-[:IS_PROFICIENT_WITH]->(p)
  `,
    {
      classes,
    }
  );

  // Get proficiencies

  const proficienciesRefs = uniqBy(
    flatten(classes.map((c) => c.proficiencies)),
    'url'
  );

  const proficiencies = await Promise.all(
    proficienciesRefs.map(({ url }) =>
      instance.get(url).then((res) => res.data)
    )
  );

  // console.log(JSON.stringify(proficiencies.slice(0, 2), null, 2));

  await session.run(
    `
    UNWIND $proficiencies as prof
    UNWIND prof.references as ref
    MATCH (p:Proficiency {url: prof.url})
    MERGE (p) - [r:REFERENCES] -> (rr:Reference { url: ref.url })
    SET p.name=prof.name, p.type=prof.type, rr=ref
  `,
    { proficiencies }
  );
  // equipment categories

  const equipmentCategories = (await instance.get('api/equipment-categories'))
    .data.results;
  const expanded = (
    await Promise.all(
      equipmentCategories.map((ec) =>
        instance.get(ec.url).then((res) => res.data)
      )
    )
  ).filter((ec) => !!ec.url);
  const res = await session.run(
    `
    UNWIND $ecs AS ec
    UNWIND ec.equipment as eq
    MERGE (eqq:Equipment {url: eq.url})
    SET eqq.name=eq.name
    MERGE (ecc:\`Equipment Category\` {url: ec.url})
    SET ecc.name=ec.name
    MERGE (eqq) - [:IS_PART_OF] -> (ecc)
  `,
    {
      ecs: expanded,
    }
  );
  console.log('Done');
  //MERGE (eqq:Equipment { url: eq.url, name: eq.name }) - [:IS_PART_OF] -> (ecc:\`Equipment Category\` {url: ec.url})
}

ingestClasses()
  .then(() => process.exit(0))
  .catch(console.error);
