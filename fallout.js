const { readFileSync, writeFileSync } = require('fs');
const { spawn } = require('child_process');

var dataFile = process.argv[2];
var dotFile = "temp.gv";
var pedigreeImageFile = "pedigree.png"

if (!dataFile) {
  return -1;
}

var rawData = readFileSync(dataFile, 'utf8');

var saveGame = JSON.parse(rawData.trim());

var dwellers = saveGame.dwellers.dwellers;

var dwellersById = {};

var males = [];
var females = [];
var noparents = [];

for (var i = 0; i < dwellers.length; i++) {
  var d = dwellers[i];
  dwellersById[d.serializeId] = d;

  // new properties
  d.children = [];
  d.mom = null;
  d.dad = null;

  if (d.gender === 1) {
    females.push(d);
  } else if (d.gender === 2) {
    males.push(d);
  } else {
    throw `Unexpected gender ${d.gender}`
  }
}

for (var i = 0; i < dwellers.length; i++) {
  var d = dwellers[i];
  d.dad = getDad(d);
  d.mom = getMom(d);
  if (d.dad) {
    d.dad.children.push(d);
  }
  if (d.mom) {
    d.mom.children.push(d);
  }
  if (!d.mom && !d.dad) {
    noparents.push(d);
  }
}

var generationsOfProgeny = {};
function countGenerationsOfProgeny(dweller) {
  if (typeof(dweller.generationsOfProginy) !== "number") {
    if (dweller.children.length==0) {
      dweller.generationsOfProginy = 0;
    } else {
      dweller.generationsOfProginy = 1 + Math.max(...dweller.children.map(countGenerationsOfProgeny));
    }
    if (!generationsOfProgeny[dweller.generationsOfProginy]) {
      generationsOfProgeny[dweller.generationsOfProginy] = []
    }
    generationsOfProgeny[dweller.generationsOfProginy].push(dweller);
  }
  return dweller.generationsOfProginy;
}
noparents.map(countGenerationsOfProgeny);

function determineGeneration(dweller, currentGen) {
  currentGen = currentGen || 0;
  dweller.generation = dweller.generation || currentGen;
  dweller.generation = Math.max(currentGen, dweller.generation);

  dweller.children.map(x=>determineGeneration(x, currentGen + 1));
}
noparents.map(x=>determineGeneration(x, 0));

var dwellersByGeneration = {};
for(var i = 0; i < dwellers.length; i++) {
  var d = dwellers[i];
  var gen = d.generation;

  if (!dwellersByGeneration[gen]) { dwellersByGeneration[gen] = []; }
  dwellersByGeneration[gen].push(d);
}

var relationships = {};
var edges = {};
for (var i = 0; i < dwellers.length; i++) {
  var d = dwellers[i];

  var child_id = getId(d);
  var dad_id = getId(d.dad);
  var mom_id = getId(d.mom);

  if (dad_id && mom_id) {
    var relationship = `\"${dad_id}_${mom_id}\"`;
    relationships[relationship] = true;

    edges[`${dad_id} -> ${relationship} [arrowhead=none];\n`] = true;

    edges[`${mom_id} -> ${relationship} [arrowhead=none];\n`] = true;

    edges[`${relationship} -> ${child_id};\n`] = true;
  }
  else if (dad_id || mom_id) {
    throw `Expected 2 parents. Dad=${dad_id} Mom=${mom_id}`
  }
}

edges = Object.keys(edges);
relationships = Object.keys(relationships);

var rankBy = generationsOfProgeny;
var ranks = "";
for (var i in Object.keys(rankBy)) {
  ranks += `{rank=same; ${rankBy[i].filter(hasRelationships).map(getId).join("; ")}; };\n`;
}

var nodes = "";
nodes += "node [shape=rectangle];\n";
nodes += males.filter(hasRelationships).map(getNode).join("\n");
nodes += "\n\n";
nodes += "node [shape=oval];\n";
nodes += females.filter(hasRelationships).map(getNode).join("\n");
nodes += "\n\n";
nodes += "node [width=.1 shape=point label=\"\"]; "
nodes += relationships.map(x => `${x};`).join(" ");
nodes += "\n";

var graphvis = `digraph Pedigree {\n\ngraph [ layout=dot ]\n\n${nodes}\n${ranks}\n${edges.join("")}\n}`;
writeFileSync(dotFile, graphvis);
spawn('dot', ["-Tpng", "-o"+pedigreeImageFile, dotFile]);

function hasRelationships(dweller) {
  return dweller.children.length > 0 || dweller.mom || dweller.dad;
}

function getNode(dweller) {
  return `${getId(dweller)} [label="${getFullName(dweller)}"];`;
}

function getId(dweller) {
  return dweller ? dweller.serializeId : null;
}

function getFullName(dweller) {
  return `${dweller.name} ${dweller.lastName}`;
}

function getAscendant(dweller, ascendant) {
  var id = dweller.relations.ascendants[ascendant];
  return dwellersById[id] ? dwellersById[id] : null;
}

function getDad(dweller) {
  return getAscendant(dweller, 0);
}

function getMom(dweller) {
  return getAscendant(dweller, 1);
}