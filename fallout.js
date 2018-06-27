const fs = require('fs');
const { spawnSync } = require('child_process');

var dataFile = process.argv[2];
var dotFile = "temp.gv";
var pedigreeImageFile = "pedigree.png"

if (!dataFile) {
  return -1;
}

var rawData = fs.readFileSync(dataFile, 'utf8');

var saveGame = JSON.parse(rawData.trim());

var dwellers = saveGame.dwellers.dwellers;

var dwellersById = {};

var males = [];
var females = [];
var noparents = [];

// first pass
dwellers.forEach(d => {
  // new properties
  d.id = d.serializeId;

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
    throw `Unexpected gender ${d.gender}`
  }
});

// 2nd pass
dwellers.forEach(d => {
  d.ascendants = d.relations.ascendants.map(x=>dwellersById[x] ? dwellersById[x] : null);

  d.ascendants.filter(x=>(x)).forEach(x => x.descendants.push(d));

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

    edges.add(`${relationship} -> ${d.id};\n`);

    if (d.dad) {
      edges.add(`${d.dad.id} -> ${relationship} [arrowhead=none];\n`);
    }
    if (d.mom) {
      edges.add(`${d.mom.id} -> ${relationship} [arrowhead=none];\n`);
    }
  }

  // Relatives
  d.ascendants.filter(x=>(x)).forEach(asc=>{
    asc.descendants.filter(r=> r && r !== d && !d.descendants.includes(r) && !d.ascendants.includes(r)).forEach(r=>{
      var min = Math.min(d.id, r.id);
      var max = Math.max(d.id, r.id);
      edges.add(`${min} -> ${max} [constraint=false color="#00000030" arrowhead=none];\n`);
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
nodes += "{ node [shape=point label=\"\"]; "
nodes += relationships.map(x => `${x};`).join(" ");
nodes += " }\n";

var graphvis = `digraph Pedigree {\n\ngraph [layout=dot splines=splines overlap=false truecolor=true]\n\n${nodes}\n${clusters}\n${edges.join("")}\n}`;

if (fs.existsSync(dotFile)) {
  fs.unlinkSync(dotFile);
}
fs.writeFileSync(dotFile, graphvis);

if (fs.existsSync(pedigreeImageFile)) {
  fs.unlinkSync(pedigreeImageFile);
}
const dot = spawnSync('dot', ["-Tpng", "-o"+pedigreeImageFile, dotFile]);
if (dot.status !== 0) {
  throw `error in dot: ${dot.stderr}`
}

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