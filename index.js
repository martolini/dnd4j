const neo4j = require('neo4j-driver');
const axios = require('axios');

const driver = neo4j.driver(
  'neo4j://localhost',
  neo4j.auth.basic('neo4j', 'test')
);

const instance = axios.create({
  baseURL: 'https://www.dnd5eapi.co/api/',
});

async function ingestClasses() {
  const session = await driver.session();
  const response = await instance.get('classes');
  const classesRefs = response.data.results;
  const classes = await Promise.all(
    classesRefs.map((ref) =>
      instance.get(`classes/${ref.index}`).then((res) => res.data)
    )
  );

  await session.run(
    `
  FOREACH (class in $classes |
    MERGE (c:Class { index: class.index })
    SET c = {
      name: class.name,
      hit_die: class.hit_die,
      url: class.url
    }
    FOREACH (prof in class.proficiencies |
      MERGE (ec:\`Equipment Category\` { url: prof.url  })
      SET ec.name = prof.name
      MERGE (c) - [:IS_PROFICIENT_WITH] -> (ec)
    )
  )
  `,
    {
      classes,
    }
  );

  // equipment categories

  const equipmentCategories = (await instance.get('/equipment-categories')).data
    .results;
  const expanded = (
    await Promise.all(
      equipmentCategories.map((ec) =>
        instance.get(`equipment-categories/${ec.index}`).then((res) => res.data)
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
