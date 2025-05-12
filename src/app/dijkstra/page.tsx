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
  MarkerType,
  ConnectionMode
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
  const isRFSource = useRef(false);

  const reactFlowToGraph = useCallback((nodes: Node[], edges: Edge[]): Graph => {
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
  }, []);

  const graphToAdjacencyListString = useCallback((graph: Graph): string => {
    const lines: string[] = [];
    const addedEdges = new Set<string>();
    Object.keys(graph).sort().forEach(node1 => {
      Object.keys(graph[node1]).sort().forEach(node2 => {
        const weight = graph[node1][node2];
        const edgeKey = [node1, node2].sort().join('-');
        if (!addedEdges.has(edgeKey) && weight !== undefined) {
          lines.push(`${node1} ${node2} ${weight}`);
          addedEdges.add(edgeKey);
        }
      });
    });
    return lines.join('\n');
  }, []);

  const graphToAdjacencyMatrixString = useCallback((graph: Graph, currentGlobalNodeNamesStr: string, currentRfNodes: Node[]): { matrixString: string, finalNodeNamesString: string } => {
    const initialNodeNames = currentGlobalNodeNamesStr.split(',').map(n => n.trim()).filter(n => n);
    const allNodeIdsInGraph = new Set<string>(initialNodeNames);

    Object.keys(graph).forEach(node => allNodeIdsInGraph.add(node));
    Object.values(graph).forEach(adj => Object.keys(adj).forEach(n => allNodeIdsInGraph.add(n)));
    currentRfNodes.forEach(node => allNodeIdsInGraph.add(node.id));

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
  }, []);

  const parseAdjacencyList = useCallback((input: string): Graph | null => {
    try {
      const newGraph: Graph = {};
      const lines = input.trim().split('\n');

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
      }
      return newGraph;
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(`Error parsing adjacency list: ${e.message}`);
      } else {
        setError('An unknown error occurred while parsing the adjacency list.');
      }
      return null;
    }
  }, []);

  const parseAdjacencyMatrix = useCallback((matrixStr: string, nodeNamesStr: string): Graph | null => {
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
            throw new Error(`Invalid matrix value "${row[j]}" at [${i + 1},${j + 1}]. Must be a number.`);
          }
          if (weight > 0) {
            newGraph[nodeNames[i]][nodeNames[j]] = weight;
          }
        }
      }
      return newGraph;
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(`Error parsing adjacency matrix: ${e.message}`);
      } else {
        setError('An unknown error occurred while parsing the adjacency matrix.');
      }
      return null;
    }
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      isRFSource.current = true;
      setRfNodes((nds) => applyNodeChanges(changes, nds));
      queueMicrotask(() => (isRFSource.current = false));
    },
    [setRfNodes]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      isRFSource.current = true;
      setRfEdges((eds) => applyEdgeChanges(changes, eds));
      queueMicrotask(() => (isRFSource.current = false));
    },
    [setRfEdges]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      isRFSource.current = true;
      const weightStr = prompt('Enter weight for the new edge:');
      if (weightStr === null) {
        isRFSource.current = false;
        return;
      }

      const weight = parseInt(weightStr, 10);
      if (isNaN(weight) || weight < 0) {
        alert('Invalid weight. Please enter a non-negative number.');
        isRFSource.current = false;
        return;
      }
      setRfEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: `${connection.source}-${connection.target}-${Date.now()}`,
            label: weight.toString(),
            type: 'default',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#b1b1b7' },
            style: { stroke: '#b1b1b7', strokeWidth: 1.5 },
          },
          eds
        )
      );
      queueMicrotask(() => (isRFSource.current = false));
    },
    [setRfEdges]
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      isRFSource.current = true;
      const oldWeight = edge.label;
      const newWeightStr = prompt(`Edit weight for edge ${edge.source}-${edge.target} (current: ${oldWeight}):`, oldWeight?.toString());

      if (newWeightStr === null) {
        isRFSource.current = false;
        return;
      }
      const newWeight = parseInt(newWeightStr, 10);
      if (isNaN(newWeight) || newWeight < 0) {
        alert('Invalid weight. Please enter a non-negative number.');
        isRFSource.current = false;
        return;
      }
      setRfEdges((eds) =>
        eds.map((e) => (e.id === edge.id ? { ...e, label: newWeight.toString() } : e))
      );
      queueMicrotask(() => (isRFSource.current = false));
    },
    [setRfEdges]
  );

  useEffect(() => {
    if (isRFSource.current) return;

    isTextSource.current = true;
    setError(null);
    let graphToVisualize: Graph | null = null;

    if (inputMode === 'list') {
      graphToVisualize = parseAdjacencyList(graphInput);
    } else {
      graphToVisualize = parseAdjacencyMatrix(matrixInput, nodeNamesInput);
    }

    const currentPath = result?.path || [];

    if (graphToVisualize) {
      const graph = graphToVisualize;

      setRfNodes((prevRfNodes) => {
        const newNodes: Node[] = [];
        const nodeIdsFromGraph = Object.keys(graph);
        const allPossibleNodeIds = new Set<string>(nodeIdsFromGraph);
        if (inputMode === 'matrix') {
          nodeNamesInput.split(',').map((n) => n.trim()).filter((n) => n).forEach((n) => allPossibleNodeIds.add(n));
        }
        if (startNode.trim()) allPossibleNodeIds.add(startNode.trim());
        if (endNode.trim()) allPossibleNodeIds.add(endNode.trim());

        const finalNodeIds = Array.from(allPossibleNodeIds).filter((id) => id.trim() !== '');
        const positions = getInitialNodePositions(finalNodeIds);

        finalNodeIds.forEach((nodeId) => {
          const existingNode = prevRfNodes.find((n) => n.id === nodeId);
          newNodes.push({
            id: nodeId,
            data: { label: nodeId },
            position: existingNode?.position || positions[nodeId] || { x: Math.random() * 400, y: Math.random() * 400 },
            style: {
              background: currentPath.includes(nodeId) ? (nodeId === startNode || nodeId === endNode ? '#22c55e' : '#60a5fa') : '#fff',
              color: currentPath.includes(nodeId) ? 'white' : '#333',
              border: '1px solid #22c55e',
            },
          });
        });
        if (
          prevRfNodes.length === newNodes.length &&
          prevRfNodes.every(
            (node, i) =>
              node.id === newNodes[i].id &&
              JSON.stringify(node.position) === JSON.stringify(newNodes[i].position) &&
              JSON.stringify(node.style) === JSON.stringify(newNodes[i].style)
          )
        ) {
          return prevRfNodes;
        }
        return newNodes;
      });

      setRfEdges((prevRfEdges) => {
        const newEdges: Edge[] = [];
        const nodeIdsFromGraph = Object.keys(graph);
        const allPossibleNodeIds = new Set<string>(nodeIdsFromGraph);
        if (inputMode === 'matrix') {
          nodeNamesInput.split(',').map((n) => n.trim()).filter((n) => n).forEach((n) => allPossibleNodeIds.add(n));
        }
        if (startNode.trim()) allPossibleNodeIds.add(startNode.trim());
        if (endNode.trim()) allPossibleNodeIds.add(endNode.trim());
        const finalNodeIds = Array.from(allPossibleNodeIds).filter((id) => id.trim() !== '');

        const addedGraphEdges = new Set<string>();

        finalNodeIds.forEach((nodeId) => {
          if (graph[nodeId]) {
            Object.entries(graph[nodeId]).forEach(([target, weight]) => {
              if (finalNodeIds.includes(target)) {
                const edgeKey1 = `${nodeId}-${target}`;
                const edgeKey2 = `${target}-${nodeId}`;

                if (addedGraphEdges.has(edgeKey1) || addedGraphEdges.has(edgeKey2)) return;

                const isPathEdge =
                  currentPath.includes(nodeId) &&
                  currentPath.includes(target) &&
                  (currentPath.indexOf(target) === currentPath.indexOf(nodeId) + 1 || currentPath.indexOf(nodeId) === currentPath.indexOf(target) + 1);

                const sourceNode = nodeId < target ? nodeId : target;
                const targetNode = nodeId < target ? target : nodeId;
                const reactFlowEdgeId = `${sourceNode}-${targetNode}`;

                newEdges.push({
                  id: reactFlowEdgeId,
                  source: nodeId,
                  target: target,
                  label: weight.toString(),
                  type: 'default',
                  animated: isPathEdge,
                  markerEnd: { type: MarkerType.ArrowClosed, color: isPathEdge ? '#22c55e' : '#b1b1b7' },
                  style: { stroke: isPathEdge ? '#22c55e' : '#b1b1b7', strokeWidth: isPathEdge ? 2.5 : 1.5 },
                });
                addedGraphEdges.add(edgeKey1);
                addedGraphEdges.add(edgeKey2);
              }
            });
          }
        });
        if (
          prevRfEdges.length === newEdges.length &&
          prevRfEdges.every((edge, i) => edge.id === newEdges[i].id && edge.label === newEdges[i].label && edge.animated === newEdges[i].animated)
        ) {
          return prevRfEdges;
        }
        return newEdges;
      });
    } else {
      if (inputMode === 'matrix' && nodeNamesInput.trim() !== '') {
        setRfNodes((prevRfNodes) => {
          const nodeNames = nodeNamesInput.split(',').map((n) => n.trim()).filter((n) => n);
          if (nodeNames.length === 0) return [];
          const positions = getInitialNodePositions(nodeNames);
          const newNodes = nodeNames.map((name) => {
            const existingNode = prevRfNodes.find((n) => n.id === name);
            return {
              id: name,
              data: { label: name },
              position: existingNode?.position || positions[name] || { x: Math.random() * 400, y: Math.random() * 400 },
              style: { background: '#fff', color: '#333', border: '1px solid #22c55e' },
            };
          });
          if (
            prevRfNodes.length === newNodes.length &&
            prevRfNodes.every((node, i) => node.id === newNodes[i].id && JSON.stringify(node.position) === JSON.stringify(newNodes[i].position))
          ) {
            return prevRfNodes;
          }
          return newNodes;
        });
        setRfEdges([]);
      } else {
        setRfNodes([]);
        setRfEdges([]);
      }
    }
    queueMicrotask(() => {
      isTextSource.current = false;
    });
  }, [graphInput, matrixInput, nodeNamesInput, inputMode, result, startNode, endNode, parseAdjacencyList, parseAdjacencyMatrix]);

  useEffect(() => {
    if (isTextSource.current || !isRFSource.current) {
      if (isRFSource.current) isRFSource.current = false;
      return;
    }

    const currentGraph = reactFlowToGraph(rfNodes, rfEdges);

    if (inputMode === 'list') {
      const newAdjList = graphToAdjacencyListString(currentGraph);
      if (newAdjList !== graphInput) {
        setGraphInput(newAdjList);
      }
    } else {
      const { matrixString, finalNodeNamesString } = graphToAdjacencyMatrixString(currentGraph, nodeNamesInput, rfNodes);
      if (matrixString !== matrixInput) {
        setMatrixInput(matrixString);
      }
      if (finalNodeNamesString !== nodeNamesInput) {
        setNodeNamesInput(finalNodeNamesString);
      }
    }
    isRFSource.current = false;
  }, [rfNodes, rfEdges]);

  const handleAddNode = () => {
    const trimmedNodeName = newNodeName.trim();
    if (!trimmedNodeName) {
      alert('Node name cannot be empty.');
      return;
    }
    if (rfNodes.find((node) => node.id === trimmedNodeName)) {
      alert('Node with this name already exists.');
      return;
    }

    isRFSource.current = true;

    const newNode: Node = {
      id: trimmedNodeName,
      data: { label: trimmedNodeName },
      position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 },
      style: { background: '#fff', color: '#333', border: '1px solid #22c55e' },
    };
    setRfNodes((nds) => [...nds, newNode]);

    if (inputMode === 'matrix') {
      setNodeNamesInput((prev) => {
        const names = prev.split(',').map((n) => n.trim()).filter((n) => n);
        if (!names.includes(trimmedNodeName)) {
          names.push(trimmedNodeName);
        }
        return names.sort().join(',');
      });
    }
    setNewNodeName('');
    queueMicrotask(() => (isRFSource.current = false));
  };

  const handleRunDijkstra = () => {
    setError(null);

    let currentGraph: Graph | null = null;

    if (rfNodes.length > 0 || rfEdges.length > 0) {
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
      Object.values(currentGraph).forEach((adj) => Object.keys(adj).forEach((n) => allNodesInCurrentGraph.add(n)));
      rfNodes.forEach((n) => allNodesInCurrentGraph.add(n.id));

      if (!allNodesInCurrentGraph.has(startNode) && startNode.trim() !== '') {
        setError(`Start node "${startNode}" does not exist in the graph.`);
        setResult(null);
        setResult((prevState) => ({ path: [], distance: Infinity } as DijkstraResult));
        return;
      }
      if (!allNodesInCurrentGraph.has(endNode) && endNode.trim() !== '') {
        setError(`End node "${endNode}" does not exist in the graph.`);
        setResult(null);
        setResult((prevState) => ({ path: [], distance: Infinity } as DijkstraResult));
        return;
      }

      const finalGraphForDijkstra: Graph = { ...currentGraph };
      rfNodes.forEach((rn) => {
        if (!finalGraphForDijkstra[rn.id]) {
          finalGraphForDijkstra[rn.id] = {};
        }
      });
      if (startNode && !finalGraphForDijkstra[startNode]) finalGraphForDijkstra[startNode] = {};
      if (endNode && !finalGraphForDijkstra[endNode]) finalGraphForDijkstra[endNode] = {};

      const dijkstraResult = dijkstra(finalGraphForDijkstra, startNode, endNode);
      setResult(dijkstraResult);

      if (!dijkstraResult || dijkstraResult.distance === Infinity) {
        if (allNodesInCurrentGraph.has(startNode) && allNodesInCurrentGraph.has(endNode)) {
          setError(`No path found from "${startNode}" to "${endNode}".`);
        } else if (startNode.trim() === '' || endNode.trim() === '') {
          setError('Start or End node is not specified.');
        }
      }
    } else {
      setError('Could not parse the graph from the input.');
      setRfNodes([]);
      setRfEdges([]);
      setResult(null);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-8 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="w-full max-w-6xl">
        <h1 className="text-4xl font-bold text-center mb-8 text-blue-600 dark:text-blue-400">Dijkstra&apos;s Algorithm Visualizer</h1>

        <div className="mb-6 flex justify-center space-x-4">
          <button
            onClick={() => {
              setInputMode('list');
              setResult(null);
              setError(null);
            }}
            className={`px-4 py-2 rounded-md font-semibold transition-colors ${
              inputMode === 'list' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            Adjacency List
          </button>
          <button
            onClick={() => {
              setInputMode('matrix');
              setResult(null);
              setError(null);
            }}
            className={`px-4 py-2 rounded-md font-semibold transition-colors ${
              inputMode === 'matrix' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
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
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                    setGraphInput(e.target.value);
                    setResult(null);
                    setError(null);
                  }}
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
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      setNodeNamesInput(e.target.value);
                      setResult(null);
                      setError(null);
                    }}
                    placeholder="A,B,C,D,E,F"
                  />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  Enter adjacency matrix (rows separated by newlines, values by spaces). Use 0 for no direct edge.
                </p>
                <textarea
                  className="w-full h-48 p-3 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none resize-none font-mono text-sm"
                  value={matrixInput}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                    setMatrixInput(e.target.value);
                    setResult(null);
                    setError(null);
                  }}
                  placeholder="0 1 4 0\n1 0 2 7\n4 2 0 1\n0 7 1 0"
                />
              </>
            )}
            <div className="mt-4">
              <label htmlFor="startNode" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                Start Node:
              </label>
              <input
                type="text"
                id="startNode"
                value={startNode}
                onChange={(e) => {
                  setStartNode(e.target.value.trim());
                  setResult(null);
                  setError(null);
                }}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none"
              />
            </div>
            <div className="mt-2">
              <label htmlFor="endNode" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                End Node:
              </label>
              <input
                type="text"
                id="endNode"
                value={endNode}
                onChange={(e) => {
                  setEndNode(e.target.value.trim());
                  setResult(null);
                  setError(null);
                }}
                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none"
              />
            </div>
            <button
              onClick={handleRunDijkstra}
              className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400"
            >
              Find Shortest Path
            </button>
            <div className="mt-6">
              <label htmlFor="newNodeName" className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                Add New Node to Graph:
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  id="newNodeName"
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  placeholder="Node Name (e.g. G)"
                  className="flex-grow p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 outline-none"
                />
                <button
                  onClick={handleAddNode}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-3 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-300"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 bg-white dark:bg-gray-800 p-1 rounded-lg shadow-md min-h-[500px] h-[600px]">
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onEdgeClick={onEdgeClick}
              fitView
              attributionPosition="bottom-left"
              className="bg-gray-100 dark:bg-gray-700 rounded-md"
              deleteKeyCode={['Backspace', 'Delete']}
              connectionMode={ConnectionMode.Loose}
            >
              <MiniMap
                nodeStrokeColor={(n: Node) => {
                  if (n.style?.background === '#22c55e') return '#22c55e';
                  if (n.style?.background === '#60a5fa') return '#60a5fa';
                  return '#555';
                }}
                nodeColor={(n: Node): string => (n.style?.background as string || '#fff')}
                nodeBorderRadius={2}
              />
              <Controls />
              <Background color="#aaa" gap={16} />
            </ReactFlow>
          </div>
        </div>

        <div className="grid md:grid-cols-1 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md">
            {(error || (result && result.path && result.path.length > 0)) && (
              <h2 className="text-2xl font-semibold mb-3 text-gray-700 dark:text-gray-300">Output</h2>
            )}
            {error && (
              <div
                className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded-md relative mb-6"
                role="alert"
              >
                <strong className="font-bold">Error: </strong>
                <span className="block sm:inline">{error}</span>
              </div>
            )}

            {result && result.path && result.path.length > 0 && result.distance !== Infinity && (
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
            {!error && (!result || !result.path || result.path.length === 0 || result.distance === Infinity) && !(startNode.trim() === '' || endNode.trim() === '') && (
              <p className="text-gray-500 dark:text-gray-400">
                Enter graph data, start/end nodes, and click &quot;Find Shortest Path&quot; to see the results. If a path is not found after calculation, it
                will be indicated here.
              </p>
            )}
            {(startNode.trim() === '' || endNode.trim() === '') && !error && (
              <p className="text-gray-500 dark:text-gray-400">Please specify both Start and End nodes.</p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
