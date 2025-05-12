'use client';

import { useState, ChangeEvent, useEffect, useCallback, useRef } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';

import { dijkstra, Graph, DijkstraResult } from '@/lib/dijkstra';

type InputMode = 'list' | 'matrix';

const getInitialNodePositions = (nodeIds: string[], radius: number = 200) => {
  const positions: { [key: string]: { x: number; y: number } } = {};
  const numNodes = nodeIds.length;
  nodeIds.forEach((id, index) => {
    const angle = (index / numNodes) * 2 * Math.PI;
    positions[id] = {
      x: radius * Math.cos(angle) + 300,
      y: radius * Math.sin(angle) + 150,
    };
  });
  return positions;
};

export default function DijkstraPage() {
  const [graphInput, setGraphInput] = useState('A B 1\nA C 4\nB C 2\nB D 7\nC D 1\nC E 5\nD E 2\nD F 3\nE F 6');
  const [matrixInput, setMatrixInput] = useState('0 1 4 0 0 0\n1 0 2 7 0 0\n4 2 0 1 5 0\n0 7 1 0 2 3\n0 0 5 2 0 6\n0 0 0 3 6 0');
  const [nodeNamesInput, setNodeNamesInput] = useState('A,B,C,D,E,F');
  const [inputMode, setInputMode] = useState<InputMode>('list');
  const [startNode, setStartNode] = useState('A');
  const [endNode, setEndNode] = useState('F');
  const [result, setResult] = useState<DijkstraResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);

  const [newNodeName, setNewNodeName] = useState('');
  const isTextSource = useRef(false);

  const reactFlowToGraph = (nodes: Node[], edges: Edge[]): Graph => {
    const newGraph: Graph = {};
    nodes.forEach(node => {
      if (!newGraph[node.id]) {
        newGraph[node.id] = {};
      }
    });

    edges.forEach(edge => {
      const source = edge.source;
      const target = edge.target;
      if (!newGraph[source]) newGraph[source] = {};
      if (!newGraph[target]) newGraph[target] = {};

      const weight = parseInt(edge.label as string, 10);

      if (!isNaN(weight) && weight >= 0) {
        newGraph[source][target] = weight;
        newGraph[target][source] = weight;
      }
    });
    return newGraph;
  };

  const graphToAdjacencyListString = (graph: Graph): string => {
    const lines: string[] = [];
    const addedEdges = new Set<string>();
    Object.keys(graph).forEach(node1 => {
      Object.keys(graph[node1]).forEach(node2 => {
        const weight = graph[node1][node2];
        const edgeKey = [node1, node2].sort().join('-');
        if (!addedEdges.has(edgeKey) && weight !== undefined) {
          lines.push(`${node1} ${node2} ${weight}`);
          addedEdges.add(edgeKey);
        }
      });
    });
    return lines.join('\n');
  };

  const graphToAdjacencyMatrixString = (graph: Graph, currentGlobalNodeNamesStr: string): { matrixString: string, finalNodeNamesString: string } => {
    const initialNodeNames = currentGlobalNodeNamesStr.split(',').map(n => n.trim()).filter(n => n);
    const allNodeIdsInGraph = new Set<string>(initialNodeNames);
    
    Object.keys(graph).forEach(node => allNodeIdsInGraph.add(node));
    Object.values(graph).forEach(adj => Object.keys(adj).forEach(n => allNodeIdsInGraph.add(n)));
    rfNodes.forEach(node => allNodeIdsInGraph.add(node.id));

    const finalNodeNames = Array.from(allNodeIdsInGraph).filter(name => name.trim() !== '').sort();
    
    const nameToIndex = new Map(finalNodeNames.map((name, i) => [name, i]));
    const size = finalNodeNames.length;
    const matrix: number[][] = Array(size).fill(null).map(() => Array(size).fill(0));

    finalNodeNames.forEach((node1, i) => {
      if (graph[node1]) {
        Object.entries(graph[node1]).forEach(([node2, weight]) => {
          const j = nameToIndex.get(node2);
          if (j !== undefined && weight !== undefined) {
            matrix[i][j] = weight;
          }
        });
      }
    });

    const matrixString = matrix.map(row => row.join(' ')).join('\n');
    return { matrixString, finalNodeNamesString: finalNodeNames.join(',') };
  };

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      isTextSource.current = false;
      setRfNodes((nds) => applyNodeChanges(changes, nds));
    },
    [setRfNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      isTextSource.current = false;
      setRfEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [setRfEdges]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      isTextSource.current = false;
      const weightStr = prompt('Enter weight for the new edge:');
      if (weightStr === null) return;

      const weight = parseInt(weightStr, 10);
      if (isNaN(weight) || weight < 0) {
        alert('Invalid weight. Please enter a non-negative number.');
        return;
      }
      setRfEdges((eds) => addEdge({
        ...connection,
        id: `${connection.source}-${connection.target}-${Date.now()}`,
        label: weight.toString(),
        type: 'default',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
        style: { stroke: '#b1b1b7', strokeWidth: 1.5 },
      }, eds));
    },
    [setRfEdges]
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      isTextSource.current = false;
      const oldWeight = edge.label;
      const newWeightStr = prompt(`Edit weight for edge ${edge.source}-${edge.target} (current: ${oldWeight}):`, oldWeight?.toString());

      if (newWeightStr === null) return;
      const newWeight = parseInt(newWeightStr, 10);
      if (isNaN(newWeight) || newWeight < 0) {
        alert('Invalid weight. Please enter a non-negative number.');
        return;
      }
      setRfEdges((eds) =>
        eds.map((e) => (e.id === edge.id ? { ...e, label: newWeight.toString() } : e))
      );
    },
    [setRfEdges]
  );
  
  const convertGraphToReactFlow = useCallback((currentGraph: Graph, path: string[] = []) => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const nodeIdsFromGraph = Object.keys(currentGraph);
    
    const allPossibleNodeIds = new Set(nodeIdsFromGraph);
    if (inputMode === 'matrix') {
        nodeNamesInput.split(',').map(n => n.trim()).filter(n => n).forEach(n => allPossibleNodeIds.add(n));
    }
    if (startNode) allPossibleNodeIds.add(startNode);
    if (endNode) allPossibleNodeIds.add(endNode);

    const finalNodeIds = Array.from(allPossibleNodeIds);
    const positions = getInitialNodePositions(finalNodeIds);

    finalNodeIds.forEach(nodeId => {
      const existingNode = rfNodes.find(n => n.id === nodeId);
      nodes.push({
        id: nodeId,
        data: { label: nodeId },
        position: existingNode?.position || positions[nodeId] || { x: Math.random() * 400, y: Math.random() * 400 },
        style: {
          background: path.includes(nodeId) ? (nodeId === startNode || nodeId === endNode ? '#22c55e' : '#60a5fa') : '#fff',
          color: path.includes(nodeId) ? 'white' : '#333',
          border: '1px solid #22c55e',
        }
      });

      if (currentGraph[nodeId]) {
        Object.entries(currentGraph[nodeId]).forEach(([target, weight]) => {
          if (finalNodeIds.includes(target)) {
            const edgeId = `${nodeId}-${target}`;
            const isPathEdge = path.includes(nodeId) && path.includes(target) && path.indexOf(target) === path.indexOf(nodeId) + 1;
            edges.push({
              id: edgeId,
              source: nodeId,
              target: target,
              label: weight.toString(),
              type: 'default',
              animated: isPathEdge,
              markerEnd: { type: MarkerType.ArrowClosed, color: isPathEdge ? '#22c55e' : '#b1b1b7' },
              style: { stroke: isPathEdge ? '#22c55e' : '#b1b1b7', strokeWidth: isPathEdge ? 2.5 : 1.5 },
            });
          }
        });
      }
    });
    setRfNodes(nodes);
    setRfEdges(edges);
  }, [inputMode, nodeNamesInput, startNode, endNode, setRfNodes, setRfEdges]);

  useEffect(() => {
    isTextSource.current = true;
    setError(null);
    let graphToVisualize: Graph | null = null;

    if (inputMode === 'list') {
      graphToVisualize = parseAdjacencyList(graphInput);
    } else {
      graphToVisualize = parseAdjacencyMatrix(matrixInput, nodeNamesInput);
    }

    if (graphToVisualize) {
      convertGraphToReactFlow(graphToVisualize, result?.path);
    } else {
      if (inputMode === 'matrix' && nodeNamesInput.trim() !== '') {
         convertGraphToReactFlow({}, result?.path);
      } else {
        setRfNodes([]);
        setRfEdges([]);
      }
    }
    queueMicrotask(() => {
      isTextSource.current = false;
    });
  }, [graphInput, matrixInput, nodeNamesInput, inputMode, result?.path, convertGraphToReactFlow]);

  useEffect(() => {
    if (isTextSource.current) {
      return;
    }

    const currentGraph = reactFlowToGraph(rfNodes, rfEdges);

    if (inputMode === 'list') {
      const newAdjList = graphToAdjacencyListString(currentGraph);
      if (newAdjList !== graphInput) {
        setGraphInput(newAdjList);
      }
    } else {
      const { matrixString, finalNodeNamesString } = graphToAdjacencyMatrixString(currentGraph, nodeNamesInput);
      if (matrixString !== matrixInput) {
        setMatrixInput(matrixString);
      }
      if (finalNodeNamesString !== nodeNamesInput) {
        setNodeNamesInput(finalNodeNamesString);
      }
    }
  }, [rfNodes, rfEdges, inputMode, graphInput, matrixInput, nodeNamesInput]);

  const parseAdjacencyList = (input: string): Graph | null => {
    try {
      const newGraph: Graph = {};
      const lines = input.trim().split('\n');
      const definedNodes = new Set<string>();

      for (const line of lines) {
        if (line.trim() === '') continue;
        const parts = line.trim().split(/\s+/);
        if (parts.length !== 3) {
          throw new Error(`Invalid line format: "${line}". Expected format: Node1 Node2 Weight`);
        }
        const [node1, node2, weightStr] = parts;
        const weight = parseInt(weightStr, 10);
        if (isNaN(weight) || weight < 0) {
          throw new Error(`Invalid weight: "${weightStr}" in line "${line}". Weight must be a non-negative number.`);
        }

        if (!newGraph[node1]) newGraph[node1] = {};
        if (!newGraph[node2]) newGraph[node2] = {};
        
        newGraph[node1][node2] = weight;
        newGraph[node2][node1] = weight;

        definedNodes.add(node1);
        definedNodes.add(node2);
      }
      
      return newGraph;
    } catch (e: any) {
      setError(`Error parsing adjacency list: ${e.message}`);
      return null;
    }
  };

  const parseAdjacencyMatrix = (matrixStr: string, nodeNamesStr: string): Graph | null => {
    try {
      const newGraph: Graph = {};
      const nodeNames = nodeNamesStr.trim().split(',').map(name => name.trim()).filter(name => name);

      if (nodeNames.length === 0 && matrixStr.trim() !== '') {
          throw new Error('Node names are required for adjacency matrix if matrix data is provided.');
      }
      if (nodeNames.length === 0 && matrixStr.trim() === '') {
          return {};
      }

      const uniqueNodeNames = new Set(nodeNames);
      if (uniqueNodeNames.size !== nodeNames.length) {
          throw new Error('Node names must be unique.');
      }

      for (const name of nodeNames) {
        newGraph[name] = {};
      }
      
      const rows = matrixStr.trim().split('\n').filter(row => row.trim() !== '');

      if (rows.length > 0 && rows.length !== nodeNames.length) {
        throw new Error(`Matrix row count (${rows.length}) must match node names count (${nodeNames.length}).`);
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i].trim().split(/\s+/);
        if (row.length !== nodeNames.length) {
          throw new Error(`Matrix column count in row ${i + 1} (${row.length}) must match node names count (${nodeNames.length}).`);
        }
        for (let j = 0; j < row.length; j++) {
          const weight = parseInt(row[j], 10);
          if (isNaN(weight)) {
            throw new Error(`Invalid matrix value "${row[j]}" at [${i+1},${j+1}]. Must be a number.`);
          }
          if (weight > 0) {
            newGraph[nodeNames[i]][nodeNames[j]] = weight;
          }
        }
      }
      return newGraph;
    } catch (e: any) {
      setError(`Error parsing adjacency matrix: ${e.message}`);
      return null;
    }
  };

  const handleAddNode = () => {
    const trimmedNodeName = newNodeName.trim();
    if (!trimmedNodeName) {
      alert("Node name cannot be empty.");
      return;
    }
    if (rfNodes.find(node => node.id === trimmedNodeName)) {
      alert("Node with this name already exists.");
      return;
    }

    isTextSource.current = false;

    const newNode: Node = {
      id: trimmedNodeName,
      data: { label: trimmedNodeName },
      position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 },
    };
    setRfNodes(nds => [...nds, newNode]);

    if (inputMode === 'matrix') {
        setNodeNamesInput(prev => {
            const names = prev.split(',').map(n => n.trim()).filter(n => n);
            if (!names.includes(trimmedNodeName)) {
                names.push(trimmedNodeName);
            }
            return names.sort().join(',');
        });
    }
    setNewNodeName('');
  };

  const handleRunDijkstra = () => {
    setError(null);
    setResult(null);
    let currentGraph: Graph | null = null;

    if (rfNodes.length > 0) {
        currentGraph = reactFlowToGraph(rfNodes, rfEdges);
    } else {
        if (inputMode === 'list') {
            currentGraph = parseAdjacencyList(graphInput);
        } else {
            currentGraph = parseAdjacencyMatrix(matrixInput, nodeNamesInput);
        }
    }

    if (currentGraph) {
      const allNodesInCurrentGraph = new Set(Object.keys(currentGraph));
      Object.values(currentGraph).forEach(adj => Object.keys(adj).forEach(n => allNodesInCurrentGraph.add(n)));

      if (!allNodesInCurrentGraph.has(startNode) && startNode !== '') {
        setError(`Start node "${startNode}" does not exist in the graph.`);
        convertGraphToReactFlow(currentGraph);
        return;
      }
      if (!allNodesInCurrentGraph.has(endNode) && endNode !== '') {
        setError(`End node "${endNode}" does not exist in the graph.`);
        convertGraphToReactFlow(currentGraph);
        return;
      }
      
      const finalGraphForDijkstra: Graph = { ...currentGraph };
      rfNodes.forEach(rn => {
        if (!finalGraphForDijkstra[rn.id]) {
          finalGraphForDijkstra[rn.id] = {};
        }
      });

      const dijkstraResult = dijkstra(finalGraphForDijkstra, startNode, endNode);
      setResult(dijkstraResult);

      if (dijkstraResult) {
        convertGraphToReactFlow(finalGraphForDijkstra, dijkstraResult.path);
      } else {
        if (allNodesInCurrentGraph.has(startNode) && allNodesInCurrentGraph.has(endNode)) {
             setError(`No path found from "${startNode}" to "${endNode}".`);
        } else {
            setError(`Start or End node not in graph. Path not found.`);
        }
        convertGraphToReactFlow(finalGraphForDijkstra);
      }
    } else {
      setError("Could not parse the graph from the input.");
      setRfNodes([]);
      setRfEdges([]);
      setResult(null);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-8 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="w-full max-w-6xl">
        <h1 className="text-4xl font-bold text-center mb-8 text-blue-600 dark:text-blue-400">Dijkstra's Algorithm Visualizer</h1>

        <div className="mb-6 flex justify-center space-x-4">
          <button
            onClick={() => setInputMode('list')}
            className={`px-4 py-2 rounded-md font-semibold transition-colors ${inputMode === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
          >
            Adjacency List
          </button>
          <button
            onClick={() => setInputMode('matrix')}
            className={`px-4 py-2 rounded-md font-semibold transition-colors ${inputMode === 'matrix' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
          >
            Adjacency Matrix
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <div className="md:col-span-1 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold mb-3 text-gray-700 dark:text-gray-300">
              {inputMode === 'list' ? 'Graph Input (Adjacency List)' : 'Graph Input (Adjacency Matrix)'}
            </h2>
            {inputMode === 'list' ? (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  Enter graph as an adjacency list (Node1 Node2 Weight per line):
                </p>
                <textarea
                  className="w-full h-48 p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none resize-none font-mono text-sm"
                  value={graphInput}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setGraphInput(e.target.value)}
                  placeholder="A B 1\nB C 2"
                />
              </>
            ) : (
              <>
                <div className="mb-4">
                    <label htmlFor="nodeNames" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                        Node Names (comma-separated, e.g., A,B,C):
                    </label>
                    <input
                        type="text"
                        id="nodeNames"
                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none"
                        value={nodeNamesInput}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNodeNamesInput(e.target.value)}
                        placeholder="A,B,C,D,E,F"
                    />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  Enter adjacency matrix (rows separated by newlines, values by spaces). Use 0 for no direct edge.
                </p>
                <textarea
                  className="w-full h-48 p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none resize-none font-mono text-sm"
                  value={matrixInput}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setMatrixInput(e.target.value)}
                  placeholder="0 1 4 0\n1 0 2 7\n4 2 0 1\n0 7 1 0"
                />
              </>
            )}
            <div className="mt-6">
              <label htmlFor="newNodeName" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                Add New Node to Graph:
              </label>
              <div className="flex space-x-2 mt-1">
                <input
                  type="text"
                  id="newNodeName"
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  placeholder="Node Name"
                  className="flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none"
                />
                <button
                  onClick={handleAddNode}
                  className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-md transition-colors"
                >
                  Add Node
                </button>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md min-h-[500px]">
            <h2 className="text-2xl font-semibold mb-3 text-gray-700 dark:text-gray-300">Graph Visualization</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                Interact with the graph: connect nodes, edit edge weights by clicking them. Select nodes/edges and press Delete/Backspace to remove.
            </p>
            <div style={{ height: '450px' }} className="border rounded-md border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
                <ReactFlow
                    nodes={rfNodes}
                    edges={rfEdges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onEdgeClick={onEdgeClick}
                    fitView
                    attributionPosition="bottom-left"
                    deleteKeyCode={['Backspace', 'Delete']}
                    nodesDraggable={true}
                    nodesConnectable={true}
                >
                    <MiniMap />
                    <Controls />
                    <Background />
                </ReactFlow>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                <h2 className="text-2xl font-semibold mb-3 text-gray-700 dark:text-gray-300">Controls</h2>
                <div className="mb-4">
                  <label htmlFor="startNode" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Start Node:</label>
                  <input
                    type="text"
                    id="startNode"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none"
                    value={startNode}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setStartNode(e.target.value.trim())}
                  />
                </div>
                <div className="mb-6">
                  <label htmlFor="endNode" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">End Node:</label>
                  <input
                    type="text"
                    id="endNode"
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none"
                    value={endNode}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setEndNode(e.target.value.trim())}
                  />
                </div>
                <button
                  onClick={handleRunDijkstra}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-md transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  Find Shortest Path
                </button>
            </div>
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
                {(error || result) && (
                    <h2 className="text-2xl font-semibold mb-3 text-gray-700 dark:text-gray-300">Output</h2>
                )}
                {error && (
                  <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded-md relative mb-6" role="alert">
                    <strong className="font-bold">Error: </strong>
                    <span className="block sm:inline">{error}</span>
                  </div>
                )}

                {result && (
                  <div className="bg-green-50 dark:bg-green-800 p-4 rounded-lg shadow-inner">
                    <h3 className="text-xl font-semibold mb-2 text-green-700 dark:text-green-300">Shortest Path Found</h3>
                    <p className="text-lg text-gray-800 dark:text-gray-200">
                      <span className="font-medium">Path: </span> {result.path.join(' → ')}
                    </p>
                    <p className="text-lg text-gray-800 dark:text-gray-200">
                      <span className="font-medium">Distance: </span> {result.distance}
                    </p>
                  </div>
                )}
                 {!error && !result && (
                    <p className="text-gray-500 dark:text-gray-400">Enter graph data and click "Find Shortest Path" to see the results.</p>
                )}
            </div>
        </div>

      </div>
    </main>
  );
}
