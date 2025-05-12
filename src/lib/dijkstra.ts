// src/lib/dijkstra.ts

export interface Graph {
  [node: string]: { [neighbor: string]: number };
}

export interface DijkstraResult {
  path: string[];
  distance: number;
}

export function dijkstra(graph: Graph, startNode: string, endNode: string): DijkstraResult | null {
  const distances: { [node: string]: number } = {};
  const previousNodes: { [node: string]: string | null } = {};
  const pq = new PriorityQueue<string>();

  // Initialize distances and priority queue
  for (const node in graph) {
    if (node === startNode) {
      distances[node] = 0;
      pq.enqueue(node, 0);
    } else {
      distances[node] = Infinity;
      pq.enqueue(node, Infinity);
    }
    previousNodes[node] = null;
  }

  while (!pq.isEmpty()) {
    const currentNode = pq.dequeue()?.element;

    if (!currentNode || distances[currentNode] === Infinity) {
      continue; // Skip if no path or already processed all reachable nodes
    }

    if (currentNode === endNode) {
      // Path found, reconstruct it
      const path: string[] = [];
      let tempNode = endNode;
      while (tempNode !== null && previousNodes[tempNode] !== undefined) {
        path.unshift(tempNode);
        if (tempNode === startNode) break; // Reached start node
        tempNode = previousNodes[tempNode]!;
         if (!tempNode && startNode !== endNode) { // Path reconstruction failed before reaching start
            return null; // Should not happen if logic is correct and graph is connected
         }
      }
       // Add the start node if it wasn't added (e.g. startNode === endNode or path reconstruction logic)
      if (path[0] !== startNode && startNode === endNode) path.unshift(startNode);
      else if (path[0] !== startNode && previousNodes[path[0]] === null && path.length > 0) {
        // This case handles if the loop terminated early but startNode is the predecessor
         if (Object.keys(graph).includes(startNode) && distances[startNode] === 0) {
            // Check if startNode is a valid node and was the actual start
         }
      }


      if (path[0] !== startNode) {
        // If the path doesn't start with the startNode after reconstruction (and start != end)
        // it implies no path was found or an issue in reconstruction.
        // However, if distances[endNode] is not Infinity, a path *was* found by Dijkstra.
        // This might indicate an issue with the path reconstruction logic for disconnected graphs or specific cases.
        if (distances[endNode] !== Infinity) {
             // If Dijkstra found a distance, but path reconstruction is tricky,
             // we might be missing the start node if it's not part of previousNodes chain.
             // This can happen if startNode has no incoming edges in the path.
             // A simple (but potentially incomplete) path reconstruction might just return the end node
             // if it's reachable. For a full path, this needs careful handling.
             // For now, if a distance is found, assume the path reconstruction should work.
             // If path is still empty or doesn't start with startNode, it's an issue.
             if (path.length === 0 && startNode === endNode) path.push(startNode);
             else if (path[0] !== startNode) {
                 // Fallback or error indication if path reconstruction is problematic
                 // This part of the logic needs to be robust.
                 // A common way to ensure startNode is included if a path exists:
                 let current = endNode;
                 const reconstructedPath = [];
                 while(current !== null && current !== undefined) {
                    reconstructedPath.unshift(current);
                    if (current === startNode) break;
                    current = previousNodes[current]!;
                 }
                 if (reconstructedPath[0] === startNode && distances[endNode] !== Infinity) {
                    return { path: reconstructedPath, distance: distances[endNode] };
                 } else {
                    return null; // No valid path found to reconstruct
                 }
             }
        } else {
          return null; // No path found
        }
      }
      return { path, distance: distances[endNode] };
    }

    if (!graph[currentNode]) continue;

    for (const neighbor in graph[currentNode]) {
      const distanceToNeighbor = graph[currentNode][neighbor];
      const newDistance = distances[currentNode] + distanceToNeighbor;

      if (newDistance < distances[neighbor]) {
        distances[neighbor] = newDistance;
        previousNodes[neighbor] = currentNode;
        pq.updatePriority(neighbor, newDistance);
      }
    }
  }

  return null; // No path found to the endNode
}

// Basic Priority Queue implementation
class PriorityQueue<T> {
  private elements: { element: T; priority: number }[] = [];

  enqueue(element: T, priority: number) {
    this.elements.push({ element, priority });
    this.elements.sort((a, b) => a.priority - b.priority); // Simple sort, not most efficient for large N
  }

  dequeue(): { element: T; priority: number } | undefined {
    return this.elements.shift();
  }

  isEmpty(): boolean {
    return this.elements.length === 0;
  }

  updatePriority(element: T, newPriority: number) {
    const index = this.elements.findIndex(item => item.element === element);
    if (index > -1) {
      this.elements[index].priority = newPriority;
      this.elements.sort((a, b) => a.priority - b.priority);
    }
  }
}
