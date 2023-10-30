import { memo, useEffect, useRef, useState } from "react";
import { FaTrash } from "react-icons/fa";

const VERTEX_RADIUS = 20;

interface SimplexTreeNode {
  label: number;
  children: Map<number, SimplexTreeNode>;
}

// Return a copy of the tree with the simplex [tree.label, ...simplexVertices.slice(index)] and it's faces inserted.
function insertSimplex(
  tree: SimplexTreeNode,
  simplexVertices: number[],
  index: number
): SimplexTreeNode {
  if (index >= simplexVertices.length) {
    return tree;
  }

  const newTree = {
    label: tree.label,
    children: new Map(tree.children),
  }; // Copy so that we mutate a new object.

  // We can break the insertion into two parts:
  //
  // i) Take the child of newTree with label simplexVertices[index] (create the child if it doesn't exist).
  // Insert the simplex simplexVertices.slice(index) and its faces into that child tree,
  // and set this as the new child of newTree.
  // This corresponds to adding all simplices of the form [simplexVertices[index], subsequence of simplexVertices.slice(index+1)]
  //
  // ii) Insert the simplex [tree.label, ...simplexVertices.slice(index+1)] and its faces into newTree.
  // This corresponds to adding all simplices of the form [subsequence of simplexVertices.slice(index+1)]

  // Step (i)
  const childLabel = simplexVertices[index];
  let childTree = newTree.children.get(childLabel);
  if (!childTree) {
    childTree = { label: childLabel, children: new Map() }; // New child if it doesn't exist.
  }
  newTree.children.set(
    childLabel,
    insertSimplex(childTree, simplexVertices, index + 1)
  );

  // Step (ii)
  return insertSimplex(newTree, simplexVertices, index + 1);
}

// Return a copy of the tree with the simplex simplexVertices.slice(index) and it's cofaces removed.
// simplexVertices.slice(index) must be non empty.
function deleteNonEmptySimplex(
  tree: SimplexTreeNode,
  simplexVertices: number[],
  index: number
): SimplexTreeNode | null {
  if (simplexVertices[index] === tree.label) {
    if (index === simplexVertices.length - 1) {
      return null;
    }

    index += 1;
  }

  const newChildren = new Map<number, SimplexTreeNode>();
  tree.children.forEach((node) => {
    const newChildTree = deleteNonEmptySimplex(node, simplexVertices, index);
    if (newChildTree) {
      newChildren.set(node.label, newChildTree);
    }
  });

  return {
    ...tree,
    children: newChildren,
  };
}

// Return a copy of the tree with the vertex removed.
// Decrease the label's larger than vertex by 1.
function removeVertex(
  tree: SimplexTreeNode,
  vertex: number
): SimplexTreeNode | null {
  if (tree.label === vertex) {
    return null;
  }

  const newChildren = new Map<number, SimplexTreeNode>();
  tree.children.forEach((node) => {
    const newChildTree = removeVertex(node, vertex);
    if (newChildTree) {
      newChildren.set(newChildTree.label, newChildTree); // Use newChildTree.label as labels may change.
    }
  });

  return {
    label: tree.label > vertex ? tree.label - 1 : tree.label,
    children: newChildren,
  };
}

// Insert all simplices into listOfSimplices(listOfSimplices is a map from simplex size to simplices).
function insertSimplices(
  node: SimplexTreeNode,
  visitedLabels: number[],
  listOfSimplices: Map<number, number[][]>
) {
  const simplex = [...visitedLabels, node.label];
  const simplices = listOfSimplices.get(visitedLabels.length);
  if (simplices !== undefined) {
    simplices.push(simplex);
  } else {
    listOfSimplices.set(visitedLabels.length, [simplex]);
  }

  visitedLabels.push(node.label);
  [...node.children.values()]
    .sort((a, b) => a.label - b.label)
    .forEach((child) => {
      insertSimplices(child, visitedLabels, listOfSimplices);
    });
  visitedLabels.pop();
}

interface SimplicesProps {
  simplexTree: SimplexTreeNode[];
  setSimplexTree: React.Dispatch<React.SetStateAction<SimplexTreeNode[]>>;
  setVertices: React.Dispatch<React.SetStateAction<[number, number][]>>;
  disabled: boolean;
}

const Simplices = memo(function Simplices({
  simplexTree,
  setSimplexTree,
  setVertices,
  disabled,
}: SimplicesProps) {
  const simplices = new Map() as Map<number, number[][]>;
  simplexTree.forEach((vertexTree) => {
    insertSimplices(vertexTree, [], simplices);
  });

  const simplexSizes = [...simplices.keys()];

  return (
    <div className="space-y-5">
      {simplexSizes.map((size) => (
        <div key={size}>
          <p className="font-bold">{size}-Simplex</p>
          <div className="space-y-1">
            {simplices.get(size)!.map((simplex, i) => {
              const onDelete = () => {
                if (size > 0) {
                  const newSimplexTree = simplexTree.map(
                    (node) => deleteNonEmptySimplex(node, simplex, 0)! // Since size > 0, we will not get null.
                  );
                  setSimplexTree(newSimplexTree);
                } else {
                  const newSimplexTree = [
                    ...simplexTree.slice(0, simplex[0]),
                    ...simplexTree.slice(simplex[0] + 1),
                  ].map((node) => removeVertex(node, simplex[0])!); // Since we skip the tree rooted at simplex[0], we will not get null.
                  setSimplexTree(newSimplexTree);
                  setVertices((vertices) => [
                    ...vertices.slice(0, simplex[0]),
                    ...vertices.slice(simplex[0] + 1),
                  ]);
                }
              };
              return (
                <div key={i} className="flex justify-between">
                  <span>{JSON.stringify(simplex.map((i) => i + 1))}</span>
                  <button onClick={onDelete} disabled={disabled} className={disabled ? "opacity-25" : ""}><FaTrash /></button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
});

// https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas#scaling_for_high_resolution_displays
function resizeCanvas(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio;

  const width = window.innerWidth - 300;
  const height = window.innerHeight;

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.scale(dpr, dpr);
  }
}

interface SimplexEditorProps {
  simplexTree: SimplexTreeNode[],
  setSimplexTree: React.Dispatch<React.SetStateAction<SimplexTreeNode[]>>,
  vertices: [number, number][],
  setVertices: React.Dispatch<React.SetStateAction<[number, number][]>>,
  setView: React.Dispatch<React.SetStateAction<'editor' | 'details'>>,
}

function SimplexEditor({ simplexTree, setSimplexTree, vertices, setVertices, setView }: SimplexEditorProps) {
  const canvasRef = useRef(null as null | HTMLCanvasElement);
  const [drag, setDrag] = useState(
    null as null | {
      initialOffsetFromCanvasCenter: [number, number];
      vertex: null | {
        index: number;
        offsetFromVertexCenter: [number, number];
      };
    }
  );
  const [selectedVertices, setSelectedVertices] = useState(
    null as null | number[]
  );
  // Store canvas dimensions as state so that we rerender when the window resizes.
  const [, setCanvasDimensions] = useState([0, 0] as [number, number]);

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;

      resizeCanvas(canvas);

      const windowResize = () => {
        resizeCanvas(canvas);
        setCanvasDimensions([window.innerWidth - 300, window.innerHeight]);
      };

      window.addEventListener("resize", windowResize);
      return () => {
        window.removeEventListener("resize", windowResize);
      };
    }
  }, []);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const canvas = canvasRef.current;

    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }

      const rect = canvas.getBoundingClientRect();

      ctx.clearRect(0, 0, rect.width, rect.height);

      simplexTree.forEach((node1) => {
        node1.children.forEach((node2) => {
          node2.children.forEach((node3) => {
            const vertex1 = vertices[node1.label];
            const vertex2 = vertices[node2.label];
            const vertex3 = vertices[node3.label];

            ctx.fillStyle = "rgb(220, 220, 220)";
            ctx.beginPath();
            ctx.moveTo(
              rect.width / 2 + vertex1[0],
              rect.height / 2 + vertex1[1]
            );
            ctx.lineTo(
              rect.width / 2 + vertex2[0],
              rect.height / 2 + vertex2[1]
            );
            ctx.lineTo(
              rect.width / 2 + vertex3[0],
              rect.height / 2 + vertex3[1]
            );
            ctx.fill();
          });
        });
      });

      simplexTree.forEach((node1) => {
        node1.children.forEach((node2) => {
          const vertex1 = vertices[node1.label];
          const vertex2 = vertices[node2.label];

          ctx.strokeStyle = "black";
          ctx.beginPath();
          ctx.moveTo(rect.width / 2 + vertex1[0], rect.height / 2 + vertex1[1]);
          ctx.lineTo(rect.width / 2 + vertex2[0], rect.height / 2 + vertex2[1]);
          ctx.stroke();
        });
      });

      vertices.forEach((vertex, i) => {
        ctx.strokeStyle = "black";
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(
          rect.width / 2 + vertex[0],
          rect.height / 2 + vertex[1],
          VERTEX_RADIUS,
          0,
          2 * Math.PI
        );
        ctx.fill();
        ctx.stroke();

        if (selectedVertices && selectedVertices.includes(i)) {
          ctx.fillStyle = "rgb(224, 242, 254)";
          ctx.beginPath();
          ctx.arc(
            rect.width / 2 + vertex[0],
            rect.height / 2 + vertex[1],
            VERTEX_RADIUS,
            0,
            2 * Math.PI
          );
          ctx.fill();
        }

        ctx.font = `${VERTEX_RADIUS}px monospace`;
        ctx.fillStyle = "black";
        const numberOfDigits = Math.floor(Math.log10(i + 1)) + 1;
        ctx.fillText(
          `${i + 1}`,
          rect.width / 2 + vertex[0] - 5 * numberOfDigits,
          rect.height / 2 + vertex[1] + 5
        );
      });
    };

    const mouseDownCanvas = (e: MouseEvent) => {
      if (e.button === 0) {
        const rect = canvas.getBoundingClientRect();
        const offsetFromCanvasCenter = [
          e.clientX - rect.x - rect.width / 2,
          e.clientY - rect.y - rect.height / 2,
        ] as [number, number];

        const vertexIndex = vertices.findIndex(
          (vertex) =>
            Math.pow(vertex[0] - offsetFromCanvasCenter[0], 2) +
            Math.pow(vertex[1] - offsetFromCanvasCenter[1], 2) <
            Math.pow(VERTEX_RADIUS, 2)
        );

        if (vertexIndex > -1) {
          if (selectedVertices) {
            const indexInSelectedVertices = selectedVertices.findIndex(
              (vertex) => vertex === vertexIndex
            );
            if (indexInSelectedVertices > -1) {
              setSelectedVertices([
                ...selectedVertices.slice(0, indexInSelectedVertices),
                ...selectedVertices.slice(indexInSelectedVertices + 1),
              ]);
            } else {
              setSelectedVertices([...selectedVertices, vertexIndex]);
            }
          } else {
            setDrag({
              initialOffsetFromCanvasCenter: offsetFromCanvasCenter,
              vertex: {
                index: vertexIndex,
                offsetFromVertexCenter: [
                  offsetFromCanvasCenter[0] - vertices[vertexIndex][0],
                  offsetFromCanvasCenter[1] - vertices[vertexIndex][1],
                ],
              },
            });
          }
        } else {
          setDrag({
            initialOffsetFromCanvasCenter: offsetFromCanvasCenter,
            vertex: null,
          });
        }
      }
    };

    const mouseMoveWindow = (e: MouseEvent) => {
      if (e.button === 0) {
        if (selectedVertices) {
          return;
        }

        const rect = canvas.getBoundingClientRect();
        const offsetFromCanvasCenter = [
          e.clientX - rect.x - rect.width / 2,
          e.clientY - rect.y - rect.height / 2,
        ] as [number, number];

        if (drag && drag.vertex) {
          setVertices([
            ...vertices.slice(0, drag.vertex.index),
            [
              offsetFromCanvasCenter[0] - drag.vertex.offsetFromVertexCenter[0],
              offsetFromCanvasCenter[1] - drag.vertex.offsetFromVertexCenter[1],
            ],
            ...vertices.slice(drag.vertex.index + 1),
          ]);
        }
      }
    };

    const mouseUpWindow = (e: MouseEvent) => {
      if (e.button === 0) {
        if (selectedVertices) {
          return;
        }

        const rect = canvas.getBoundingClientRect();
        const offsetFromCanvasCenter = [
          e.clientX - rect.x - rect.width / 2,
          e.clientY - rect.y - rect.height / 2,
        ] as [number, number];

        if (drag) {
          if (drag.vertex) {
            setVertices([
              ...vertices.slice(0, drag.vertex.index),
              [
                offsetFromCanvasCenter[0] -
                drag.vertex.offsetFromVertexCenter[0],
                offsetFromCanvasCenter[1] -
                drag.vertex.offsetFromVertexCenter[1],
              ],
              ...vertices.slice(drag.vertex.index + 1),
            ]);
          } else {
            if (
              Math.pow(
                drag.initialOffsetFromCanvasCenter[0] -
                offsetFromCanvasCenter[0],
                2
              ) +
              Math.pow(
                drag.initialOffsetFromCanvasCenter[1] -
                offsetFromCanvasCenter[1],
                2
              ) <=
              25
            ) {
              setVertices([...vertices, offsetFromCanvasCenter]);
              setSimplexTree([
                ...simplexTree,
                { label: simplexTree.length, children: new Map() },
              ]);
            }
          }
        }

        setDrag(null);
      }
    };

    draw();

    canvas.addEventListener("mousedown", mouseDownCanvas);
    window.addEventListener("mousemove", mouseMoveWindow);
    window.addEventListener("mouseup", mouseUpWindow);
    return () => {
      canvas.removeEventListener("mousedown", mouseDownCanvas);
      window.removeEventListener("mousemove", mouseMoveWindow);
      window.removeEventListener("mouseup", mouseUpWindow);
    };
  });

  return (
    <div className="flex min-h-screen">
      <div className="grow h-screen overflow-auto bg-slate-200 p-2 space-y-3">
        {vertices.length === 0 && <p>Click on the canvas to create vertices.</p>}
        {selectedVertices === null && vertices.length > 1 && (
          <div className="space-x-3">
            <button
              onClick={() => {
                setSelectedVertices([]);
              }}
              className="bg-slate-700 text-white p-1 rounded"
            >
              New simplex
            </button>
            <button
              onClick={() => {
                setView('details');
              }}
              className="bg-slate-700 text-white p-1 rounded"
            >
              Simplex details
            </button>
          </div>
        )}
        {selectedVertices !== null && (
          <div className="space-x-3">
            <button
              onClick={() => {
                if (selectedVertices.length > 0) {
                  const sortedVertices = [...selectedVertices].sort((a, b) => a - b);
                  const newSimplexTree = [...simplexTree];
                  for (let i = 0; i < sortedVertices.length; i++) {
                    const vertex = sortedVertices[i];
                    newSimplexTree[vertex] = insertSimplex(
                      newSimplexTree[vertex],
                      sortedVertices,
                      i + 1
                    );
                  }
                  setSimplexTree(newSimplexTree);
                }
                setSelectedVertices(null);
              }}
              className="bg-slate-700 text-white p-1 rounded"
            >
              Create
            </button>
            <button
              onClick={() => {
                setSelectedVertices(null);
              }}
              className="bg-rose-700 text-white p-1 rounded"
            >
              Cancel
            </button>
          </div>
        )}
        {selectedVertices !== null && <p>Click on the vertices to select them.</p>}
        <Simplices
          simplexTree={simplexTree}
          setSimplexTree={setSimplexTree}
          setVertices={setVertices}
          disabled={selectedVertices !== null}
        />
      </div>
      <div>
        <canvas ref={canvasRef}></canvas>
      </div>
    </div>
  );
}

// Takes a list of p-simplices and returns Zp and Bp-1.
// Each simplex is assumed to be a sorted list of it's vertices.
function homologyGroups(simplices: number[][]) {
  if (simplices.length === 0) {
    return {
      cycles: [],
      boundaries: [],
    };
  }

  // 0-simplices
  if (simplices[0].length === 1) {
    return {
      cycles: simplices.map(simplex => [simplex]),
      boundaries: [],
    };
  }

  const facets: number[][] = [];
  const facetToIndex = new Map<string, number>(); // Index of each facet in facets.

  // Columns of the matrix
  const columns = simplices.map((simplex, index) => {
    const simplexIndices = new Set<number>();
    simplexIndices.add(index);

    const boundaryFacetIndices = new Set<number>();
    for (let i = 0; i < simplex.length; i++) {
      const facet = [...simplex.slice(0, i), ...simplex.slice(i + 1)];
      let facetIndex = facetToIndex.get(JSON.stringify(facet));
      if (facetIndex === undefined) {
        facetIndex = facets.length;
        facets.push(facet);
        facetToIndex.set(JSON.stringify(facet), facetIndex);
      }
      boundaryFacetIndices.add(facetIndex);
    }

    return {
      simplexIndices,
      boundaryFacetIndices,
    };
  });

  // Map from a 'last value' to the index of the column that has that value.
  const lastIndex = new Map<number, number>();
  const emptyBoundary = new Set<number>();

  columns.forEach((column, index) => {
    for (; ;) {
      const { simplexIndices, boundaryFacetIndices } = column;

      let columnLast = -1;
      boundaryFacetIndices.forEach(facetIndex => {
        if (facetIndex > columnLast) {
          columnLast = facetIndex;
        }
      });
      if (columnLast === -1) {
        emptyBoundary.add(index);
        return;
      }

      const columnWithSameLastIndex = lastIndex.get(columnLast);
      if (columnWithSameLastIndex === undefined) {
        lastIndex.set(columnLast, index);
        return;
      }

      const { simplexIndices: prevSimplexIndices, boundaryFacetIndices: prevBoundaryFacetIndices } = columns[columnWithSameLastIndex];

      prevSimplexIndices.forEach(simplexIndex => {
        if (simplexIndices.has(simplexIndex)) {
          simplexIndices.delete(simplexIndex);
        } else {
          simplexIndices.add(simplexIndex);
        }
      });

      prevBoundaryFacetIndices.forEach(facetIndex => {
        if (boundaryFacetIndices.has(facetIndex)) {
          boundaryFacetIndices.delete(facetIndex);
        } else {
          boundaryFacetIndices.add(facetIndex);
        }
      });
    }
  });

  const cycles = [...emptyBoundary.values()].map(columnIndex => {
    const column = columns[columnIndex];
    return [...column.simplexIndices.values()].map(simplexIndex => simplices[simplexIndex]);
  });

  const boundaries = [...lastIndex.values()].map(columnIndex => {
    const column = columns[columnIndex];
    return [...column.boundaryFacetIndices.values()].map(facetIndex => facets[facetIndex]);
  });

  return {
    cycles,
    boundaries
  };
}

interface SimplexDetailsProps {
  simplexTree: SimplexTreeNode[],
  vertices: [number, number][],
  setView: React.Dispatch<React.SetStateAction<'editor' | 'details'>>
}

function SimplexDetails({ simplexTree, vertices, setView }: SimplexDetailsProps) {
  const simplices = new Map() as Map<number, number[][]>;
  simplexTree.forEach((vertexTree) => {
    insertSimplices(vertexTree, [], simplices);
  });

  const vertexSimplices = simplices.get(0) ?? [];
  const edges = simplices.get(1) ?? [];
  const triangles = simplices.get(2) ?? [];

  const { cycles: z0 } = homologyGroups(vertexSimplices);
  const { cycles: z1, boundaries: b0 } = homologyGroups(edges);
  const { boundaries: b1 } = homologyGroups(triangles);

  let xmin = vertices.length > 0 ? vertices[0][0] : 0;
  let ymin = vertices.length > 0 ? vertices[0][1] : 0;
  let xmax = vertices.length > 0 ? vertices[0][0] : 0;
  let ymax = vertices.length > 0 ? vertices[0][1] : 0;
  vertices.forEach(vertex => {
    xmin = Math.min(xmin, vertex[0]);
    ymin = Math.min(ymin, vertex[1]);
    xmax = Math.max(xmax, vertex[0]);
    ymax = Math.max(ymax, vertex[1]);
  });
  const dimension = Math.max(xmax - xmin + 20, ymax - ymin + 20);

  const simplicialComplexSVGElements = (<>
    {triangles.map((triangle, index) =>
      <polygon key={index}
        points={`${vertices[triangle[0]][0]},${vertices[triangle[0]][1]} ${vertices[triangle[1]][0]},${vertices[triangle[1]][1]} ${vertices[triangle[2]][0]},${vertices[triangle[2]][1]}`}
        fill="rgb(220, 220, 220)" />)}
    {edges.map((edge, index) =>
      <line key={index}
        x1={`${vertices[edge[0]][0]}`} y1={`${vertices[edge[0]][1]}`}
        x2={`${vertices[edge[1]][0]}`} y2={`${vertices[edge[1]][1]}`}
        stroke="black" />)}
    {vertices.map((vertex, index) => <circle key={index} cx={`${vertex[0]}`} cy={`${vertex[1]}`} r={`${5 * dimension / 300}`} />)}
  </>);

  return (
    <div className="p-5 space-y-10">
      <div className="space-y-5">
        <div>
          <button
            onClick={() => {
              setView('editor');
            }}
            className="bg-slate-700 text-white p-1 rounded"
          >
            Back to simplex editor
          </button>
        </div>
        <p className="text-2xl font-bold">Simplex</p>
        <svg
          viewBox={`${(xmin + xmax) / 2 - dimension / 2} ${(ymin + ymax) / 2 - dimension / 2} ${dimension} ${dimension}`}
          width="300px" height="300px" xmlns="https://www.w3.org/2000/svg">
          {simplicialComplexSVGElements}
        </svg>
      </div>
      <div className="space-y-5">
        <p>Z<sub>0</sub>: Dimension {z0.length}</p>
        <div className="flex flex-wrap gap-5">
          {z0.map((cycle, index) => (
            <svg
              viewBox={`${(xmin + xmax) / 2 - dimension / 2} ${(ymin + ymax) / 2 - dimension / 2} ${dimension} ${dimension}`}
              width="200px" height="200px" className="shrink-0" xmlns="https://www.w3.org/2000/svg" key={index}>
              <g fillOpacity="0.2" strokeOpacity="0.2">
                {simplicialComplexSVGElements}
              </g>
              {cycle.map((vertex, index) => <circle key={index} cx={`${vertices[vertex[0]][0]}`} cy={`${vertices[vertex[0]][1]}`} r={`${5 * dimension / 300}`} />)}
            </svg>
          ))}
        </div>
        <p>B<sub>0</sub>: Dimension {b0.length}</p>
        <div className="flex flex-wrap gap-5">
          {b0.map((cycle, index) => (
            <svg
              viewBox={`${(xmin + xmax) / 2 - dimension / 2} ${(ymin + ymax) / 2 - dimension / 2} ${dimension} ${dimension}`}
              width="200px" height="200px" className="shrink-0" xmlns="https://www.w3.org/2000/svg" key={index}>
              <g fillOpacity="0.2" strokeOpacity="0.2">
                {simplicialComplexSVGElements}
              </g>
              {cycle.map((vertex, index) => <circle key={index} cx={`${vertices[vertex[0]][0]}`} cy={`${vertices[vertex[0]][1]}`} r={`${5 * dimension / 300}`} />)}
            </svg>
          ))}
        </div>
        <p>β<sub>0</sub> = {z0.length} - {b0.length} = {z0.length - b0.length}</p>
      </div>
      <div className="space-y-5">
        <p>Z<sub>1</sub>: Dimension {z1.length}</p>
        <div className="flex flex-wrap gap-5">
          {z1.map((cycle, index) => (
            <svg
              viewBox={`${(xmin + xmax) / 2 - dimension / 2} ${(ymin + ymax) / 2 - dimension / 2} ${dimension} ${dimension}`}
              width="200px" height="200px" className="shrink-0" xmlns="https://www.w3.org/2000/svg" key={index}>
              <g fillOpacity="0.5" strokeOpacity="0.2">
                {simplicialComplexSVGElements}
              </g>
              {cycle.map((edge, index) => <line key={index} x1={`${vertices[edge[0]][0]}`} y1={`${vertices[edge[0]][1]}`} x2={`${vertices[edge[1]][0]}`} y2={`${vertices[edge[1]][1]}`} stroke="black" strokeWidth="2px" />)}
            </svg>
          ))}
        </div>
        <p>B<sub>1</sub>: Dimension {b1.length}</p>
        <div className="flex flex-wrap gap-5">
          {b1.map((cycle, index) => (
            <svg
              viewBox={`${(xmin + xmax) / 2 - dimension / 2} ${(ymin + ymax) / 2 - dimension / 2} ${dimension} ${dimension}`}
              width="200px" height="200px" className="shrink-0" xmlns="https://www.w3.org/2000/svg" key={index}>
              <g fillOpacity="0.5" strokeOpacity="0.2">
                {simplicialComplexSVGElements}
              </g>
              {cycle.map((edge, index) => <line key={index} x1={`${vertices[edge[0]][0]}`} y1={`${vertices[edge[0]][1]}`} x2={`${vertices[edge[1]][0]}`} y2={`${vertices[edge[1]][1]}`} stroke="black" strokeWidth="2px" />)}
            </svg>
          ))}
        </div>
        <p>β<sub>1</sub> = {z1.length} - {b1.length} = {z1.length - b1.length}</p>
      </div>
    </div>
  );
}

function App() {
  const [simplexTree, setSimplexTree] = useState([] as SimplexTreeNode[]);
  const [vertices, setVertices] = useState([] as [number, number][]);
  const [view, setView] = useState<'editor' | 'details'>('editor');

  if (view === 'editor') {
    return <SimplexEditor
      simplexTree={simplexTree}
      setSimplexTree={setSimplexTree}
      vertices={vertices}
      setVertices={setVertices}
      setView={setView} />;
  } else {
    return <SimplexDetails simplexTree={simplexTree} vertices={vertices} setView={setView} />;
  }
}

export default App;
