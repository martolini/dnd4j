#!/bin/sh

set -e

docker run \
    --name dnd4j \
    -p7474:7474 -p7687:7687 -p7473:7473 \
    -d \
    -v $HOME/neo4j/dnd4j/data:/data \
    -v $PWD/conf:/var/lib/neo4j/conf \
    -v $HOME/neo4j/dnd4j/logs:/logs \
    -v $HOME/neo4j/dnd4j/import:/var/lib/neo4j/import \
    -v $HOME/neo4j/dnd4j/plugins:/plugins \
    --env NEO4J_AUTH=neo4j/test \
    neo4j:latest