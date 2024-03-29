/* jslint node: true */
/* jshint esversion: 6 */

'use strict';

const fs = require('fs');
const { extname } = require('path');
const { spawnSync } = require('child_process');

const verbose = true;
const extraverbose = true;

var dataFile = process.argv[2];
var pedigreeImageFile = process.argv[3];

if (!dataFile) {
  return -1;
}

var rawData = fs.readFileSync(dataFile, 'utf8');

var saveGame = JSON.parse(rawData.trim());
if (!saveGame) {
  throw "Unable to read file";
}

var dwellers = saveGame.dwellers.dwellers;
if (!dwellers) {
  throw "Unable to find dwellers";
}

var dwellersById = {};

var males = [];
var females = [];
var noparents = [];

// first pass
dwellers.forEach((d,i) => {
  logVerbose(`Found ${getFullName(d)}`);

  // new properties
  d.id = d.serializeId;
  if (!d.id) {
    throw `No serializeId for dwellers[${i}] - ${getFullName(d)}`;
  }

  d.children = [];
  d.grandchildren = [];
  d.descendants = [];

  d.ascendants = [];
  d.mom = null;
  d.dad = null;
  d.grandparents = [];

  // build databases
  dwellersById[d.id] = d;

  if (d.gender === 1) {
    females.push(d);
  } else if (d.gender === 2) {
    males.push(d);
  } else {
    throw `Unexpected gender ${d.gender}`;
  }
});

// 2nd pass
dwellers.forEach(d => {
  d.ascendants = d.relations.ascendants.map(x=>dwellersById[x] ? dwellersById[x] : null);

  d.ascendants.filter(x=>(x)).forEach(x => x.descendants.push(d));

  logVerbose(`Ascendants of ${getFullName(d)}: ${d.ascendants.map(getFullName).join(", ")}`);

  d.dad = d.ascendants[0];
  d.mom = d.ascendants[1];

  if (d.dad) {
    d.dad.children.push(d);
  }
  if (d.mom) {
    d.mom.children.push(d);
  }

  if (!d.mom && !d.dad) {
    noparents.push(d);
  }

  d.grandparents = d.ascendants.splice(2, d.ascendants.length);
  d.grandparents.filter(x=>(x)).forEach(x => x.grandchildren.push(d));
});

if (dwellers.filter(hasRelationships).length === 0) {
  console.log("No relationships");
  return 1;
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
      generationsOfProgeny[dweller.generationsOfProginy] = [];
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
dwellers.forEach(d => {
  var gen = d.generation;

  if (!dwellersByGeneration[gen]) { dwellersByGeneration[gen] = []; }
  dwellersByGeneration[gen].push(d);
});

dwellers = males.concat(females); // Males on the left

var relationships = new Set();
var edges = new Set();
dwellers.forEach(d => {

  if (d.dad || d.mom) {
    var relationship = `\"${d.dad.id}_${d.mom.id}\"`;
    relationships.add(relationship);

    edges.add(`${relationship} -> ${d.id} [headport=n tailport=s];\n`);

    if (d.dad) {
      edges.add(`${d.dad.id} -> ${relationship} [arrowhead=none headport=n];\n`);
      edges.add(`${d.dad.id} -> ${relationship} [arrowhead=none style=invisible];\n`);
    }
    if (d.mom) {
      edges.add(`${d.mom.id} -> ${relationship} [arrowhead=none headport=n];\n`);
      edges.add(`${d.mom.id} -> ${relationship} [arrowhead=none style=invisible];\n`);
    }
  }

  // Relatives
  d.ascendants.filter(x=>(x)).forEach(asc=>{
    asc.descendants.filter(r=> r && r !== d && !d.descendants.includes(r) && !d.ascendants.includes(r)).forEach(r=>{
      var min = Math.min(d.id, r.id);
      var max = Math.max(d.id, r.id);
      edges.add(`${min} -> ${max} [constraint=false color="#00000030" arrowhead=none];\n`);
      edges.add(`${min} -> ${max} [constraint=false style=invisible arrowhead=none]; // 1\n`);
      edges.add(`${min} -> ${max} [constraint=false style=invisible arrowhead=none]; // 2\n`);
    });
  });
});
edges = Array.from(edges);
relationships = Array.from(relationships);

var groupBy = generationsOfProgeny;
var clusters = "// clusters\n";
Object.keys(groupBy).forEach(groupName => {
  clusters += `{ group=same; ${groupBy[groupName].filter(hasRelationships).map(getId).join("; ")}; };\n`;
});

var nodes = "";
nodes += "{ // Males\nnode [shape=rectangle style=filled fillcolor=lightblue];\n";
nodes += males.filter(hasRelationships).map(getNode).join("\n");
nodes += "\n}\n\n";
nodes += "{ // Females\nnode [shape=oval style=filled fillcolor=lightpink];\n";
nodes += females.filter(hasRelationships).map(getNode).join("\n");
nodes += "\n}\n\n";
nodes += "{ node [shape=point width=0.1 label=\"\"]; ";
nodes += relationships.map(x => `${x};`).join(" ");
nodes += " }\n";

var graphvis = `digraph Pedigree {\n\ngraph [layout=dot ranksep=1 splines=splines overlap=false truecolor=true]\n\n${nodes}\n${clusters}\n${edges.join("")}\n}`;

if (extraverbose)
{
  console.log(graphvis);
}

if (fs.existsSync(pedigreeImageFile)) {
  fs.unlinkSync(pedigreeImageFile);
}
const dot = spawnSync('dot', ["-T"+extname(pedigreeImageFile).substring(1), "-o"+pedigreeImageFile], {input: graphvis});
if (dot.status !== 0) {
  console.log("Input:\n" + graphvis);

  throw `error in dot: ${dot.stderr}`;
}

function hasRelationships(dweller) {
  return dweller.ascendants.filter(x=>(x)).length > 0 || dweller.descendants.filter(x=>(x)).length > 0;
}

function getNode(dweller) {
  return `${getId(dweller)} [label="${getFullName(dweller)}"];`;
}

function getId(dweller) {
  return dweller ? dweller.serializeId : null;
}

function getFullName(dweller) {
  if (dweller) {
    return `${dweller.name} ${dweller.lastName}`;
  } else {
    return "-";
  }
}

function logVerbose(input) {
  if (verbose) {
    console.log(input);
  }
}