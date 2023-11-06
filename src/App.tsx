import { LinearScale, PointElement, LineElement, Chart, LineController, ScatterController } from "chart.js";
import { memo, useEffect, useRef, useState } from "react";
import { Chart as ChartComponent } from "react-chartjs-2";
import { FaTrash } from "react-icons/fa";
import { HashRouter, Routes, Route, Link } from "react-router-dom";

Chart.register(LinearScale, PointElement, LineElement, LineController, ScatterController);

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
  const height = window.innerHeight - 40;

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
  const VERTEX_RADIUS = 20;
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
        setCanvasDimensions([window.innerWidth - 300, window.innerHeight - 40]);
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

        const vertexIndex = vertices.length - 1 - [...vertices].reverse().findIndex(
          (vertex) =>
            Math.pow(vertex[0] - offsetFromCanvasCenter[0], 2) +
            Math.pow(vertex[1] - offsetFromCanvasCenter[1], 2) <
            Math.pow(VERTEX_RADIUS, 2)
        );

        if (vertexIndex < vertices.length) {
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
    <div className="flex">
      <div className="grow overflow-auto bg-slate-200 p-2 space-y-3">
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

function Homology() {
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

interface PersistentHomologyDetailsProps {
  vertices: [number, number][];
  setView: React.Dispatch<React.SetStateAction<'editor' | 'details'>>;
}

// https://stackoverflow.com/a/76041435
// https://stackoverflow.com/a/74246113
// https://vitejs.dev/guide/features.html#web-workers
function PersistentHomologyDetails({ vertices, setView }: PersistentHomologyDetailsProps) {
  const [loading, setLoading] = useState(true);
  const [birthsAndDeaths, setBirthsAndDeaths] = useState<[number, number][]>([]);

  useEffect(() => {
    const worker = new Worker(new URL('./persistentHomologyDetailsWorker.ts', import.meta.url));
  
    worker.onmessage = (e) => {
      setLoading(false);
      setBirthsAndDeaths(e.data.birthsAndDeaths);
    };

    worker.postMessage(vertices);

    return () => { worker.terminate(); }
  }, [vertices]);

  if (loading) {
    return <p className="p-3">Loading...</p>;
  }

  let lineMax = 10.0;
  birthsAndDeaths.forEach(([birth]) => {
    lineMax = Math.max(lineMax, birth + 10.0);
  });

  return (
    <div className="p-3 space-y-3">
      <button
        onClick={() => {
          setView('editor');
        }}
        className="bg-slate-700 text-white p-1 rounded"
      >
        Back to editor
      </button>
      <p>Persistence diagram</p>
      <div className="h-96 w-96">
        <ChartComponent type='scatter' data={{
          datasets: [{
            type: 'scatter' as const,
            label: 'Persistence diagram',
            data: birthsAndDeaths.map(([birth, death]) => ({ x: birth, y: death })),
            backgroundColor: 'red',
          },
          {
            type: 'line' as const,
            data: [{x: 0, y: 0}, { x: lineMax, y: lineMax }],
            pointBackgroundColor: 'transparent',
            pointBorderColor: 'transparent',
            backgroundColor: 'black',
            borderColor: 'black',
          }]
        }} options={{
          scales: {
            x: {
              type: 'linear',
              position: 'bottom',
            }
          }
        }} />
      </div>
    </div>
  );
}

interface PersistentHomologyEditorProps {
  setView: React.Dispatch<React.SetStateAction<'editor' | 'details'>>;
  vertices: [number, number][];
  setVertices: React.Dispatch<React.SetStateAction<[number, number][]>>;
}

function PersistentHomologyEditor({ setView, vertices, setVertices }: PersistentHomologyEditorProps) {
  const VERTEX_RADIUS = 10;
  const [editor, setEditor] = useState<'shape' | 'vertex'>('vertex');
  // Each rectangle is represented by a pair of diagonally opposite vertices.
  const [rectangles, setRectangles] = useState<[[number, number], [number, number]][]>([]);
  const canvasRef = useRef(null as null | HTMLCanvasElement);
  const [drag, setDrag] = useState(
    null as null | {
      initialOffsetFromCanvasCenter: [number, number];
      currentOffsetFromCanvasCenter: [number, number];
      object: null | {
        type: "vertex" | "shape";
        index: number;
        offsetFromCenter: [number, number];
      } | {
        type: "anchor";
        shapeIndex: number;
        anchorIndex: number;
        offsetFromCenter: [number, number];
      };
    }
  );
  const [selectedObject, setSelectedObject] = useState<null | { type: "vertex" | "shape", index: number }>(null);

  // Store canvas dimensions as state so that we rerender when the window resizes.
  const [, setCanvasDimensions] = useState([0, 0] as [number, number]);

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;

      resizeCanvas(canvas);

      const windowResize = () => {
        resizeCanvas(canvas);
        setCanvasDimensions([window.innerWidth - 300, window.innerHeight - 40]);
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

      if (editor === 'shape') {
        rectangles.forEach((rectangle, index) => {
          if (selectedObject !== null && selectedObject.type === "shape" && selectedObject.index === index) {
            return;
          }

          ctx.fillStyle = "gray";
          ctx.strokeStyle = "black";
          ctx.fillRect(rect.width / 2 + Math.min(rectangle[0][0], rectangle[1][0]), rect.height / 2 + Math.min(rectangle[0][1], rectangle[1][1]), Math.max(rectangle[0][0], rectangle[1][0]) - Math.min(rectangle[0][0], rectangle[1][0]), Math.max(rectangle[0][1], rectangle[1][1]) - Math.min(rectangle[0][1], rectangle[1][1]));
          ctx.strokeRect(rect.width / 2 + Math.min(rectangle[0][0], rectangle[1][0]), rect.height / 2 + Math.min(rectangle[0][1], rectangle[1][1]), Math.max(rectangle[0][0], rectangle[1][0]) - Math.min(rectangle[0][0], rectangle[1][0]), Math.max(rectangle[0][1], rectangle[1][1]) - Math.min(rectangle[0][1], rectangle[1][1]));
        });

        if (selectedObject !== null && selectedObject.type === "shape") {
          const rectangle = rectangles[selectedObject.index];

          ctx.fillStyle = "#2563eb";
          ctx.strokeStyle = "black";
          ctx.fillRect(rect.width / 2 + Math.min(rectangle[0][0], rectangle[1][0]), rect.height / 2 + Math.min(rectangle[0][1], rectangle[1][1]), Math.max(rectangle[0][0], rectangle[1][0]) - Math.min(rectangle[0][0], rectangle[1][0]), Math.max(rectangle[0][1], rectangle[1][1]) - Math.min(rectangle[0][1], rectangle[1][1]));
          ctx.strokeRect(rect.width / 2 + Math.min(rectangle[0][0], rectangle[1][0]), rect.height / 2 + Math.min(rectangle[0][1], rectangle[1][1]), Math.max(rectangle[0][0], rectangle[1][0]) - Math.min(rectangle[0][0], rectangle[1][0]), Math.max(rectangle[0][1], rectangle[1][1]) - Math.min(rectangle[0][1], rectangle[1][1]));

          ctx.fillStyle = "red";
          ctx.beginPath();
          ctx.arc(
            rect.width / 2 + rectangle[0][0],
            rect.height / 2 + rectangle[0][1],
            10,
            0,
            2 * Math.PI
          );
          ctx.fill();

          ctx.beginPath();
          ctx.arc(
            rect.width / 2 + rectangle[1][0],
            rect.height / 2 + rectangle[1][1],
            10,
            0,
            2 * Math.PI
          );
          ctx.fill();
        }

        if (drag && !drag.object) {
          const rectangle = [drag.initialOffsetFromCanvasCenter, drag.currentOffsetFromCanvasCenter];
          ctx.fillStyle = "rgba(150, 150, 150, 0.1)";
          ctx.strokeStyle = "black";
          ctx.fillRect(rect.width / 2 + Math.min(rectangle[0][0], rectangle[1][0]), rect.height / 2 + Math.min(rectangle[0][1], rectangle[1][1]), Math.max(rectangle[0][0], rectangle[1][0]) - Math.min(rectangle[0][0], rectangle[1][0]), Math.max(rectangle[0][1], rectangle[1][1]) - Math.min(rectangle[0][1], rectangle[1][1]));
          ctx.strokeRect(rect.width / 2 + Math.min(rectangle[0][0], rectangle[1][0]), rect.height / 2 + Math.min(rectangle[0][1], rectangle[1][1]), Math.max(rectangle[0][0], rectangle[1][0]) - Math.min(rectangle[0][0], rectangle[1][0]), Math.max(rectangle[0][1], rectangle[1][1]) - Math.min(rectangle[0][1], rectangle[1][1]));
        }
      } else {
        vertices.forEach((vertex, index) => {
          if (selectedObject !== null && selectedObject.type === "vertex" && selectedObject.index === index) {
            return;
          }

          ctx.fillStyle = "black";
          ctx.beginPath();
          ctx.arc(
            rect.width / 2 + vertex[0],
            rect.height / 2 + vertex[1],
            VERTEX_RADIUS,
            0,
            2 * Math.PI
          );
          ctx.fill();
        });

        if (selectedObject !== null && selectedObject.type === "vertex") {
          const vertex = vertices[selectedObject.index];
          ctx.fillStyle = "#2563eb";
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
      }
    };

    const mouseDownCanvas = (e: MouseEvent) => {
      if (e.button === 0) {
        const rect = canvas.getBoundingClientRect();
        const offsetFromCanvasCenter = [
          e.clientX - rect.x - rect.width / 2,
          e.clientY - rect.y - rect.height / 2,
        ] as [number, number];

        if (editor === 'vertex') {
          const vertexIndex = vertices.length - 1 - [...vertices].reverse().findIndex(
            (vertex) =>
              Math.pow(vertex[0] - offsetFromCanvasCenter[0], 2) +
              Math.pow(vertex[1] - offsetFromCanvasCenter[1], 2) <
              Math.pow(VERTEX_RADIUS, 2)
          );

          if (vertexIndex < vertices.length) {
            setDrag({
              initialOffsetFromCanvasCenter: offsetFromCanvasCenter,
              currentOffsetFromCanvasCenter: offsetFromCanvasCenter,
              object: {
                type: "vertex",
                index: vertexIndex,
                offsetFromCenter: [
                  offsetFromCanvasCenter[0] - vertices[vertexIndex][0],
                  offsetFromCanvasCenter[1] - vertices[vertexIndex][1],
                ],
              },
            });
            setSelectedObject({
              type: "vertex",
              index: vertexIndex,
            });
          } else {
            setDrag({
              initialOffsetFromCanvasCenter: offsetFromCanvasCenter,
              currentOffsetFromCanvasCenter: offsetFromCanvasCenter,
              object: null,
            });
            setSelectedObject(null);
          }
        }
        else {
          if (selectedObject && selectedObject.type === "shape") {
            // Check anchors.
            for (let i = 1; i > -1; i--) {
              const anchor = rectangles[selectedObject.index][i];
              if (Math.pow(anchor[0] - offsetFromCanvasCenter[0], 2) + Math.pow(anchor[1] - offsetFromCanvasCenter[1], 2) <= 100) {
                setDrag({
                  initialOffsetFromCanvasCenter: offsetFromCanvasCenter,
                  currentOffsetFromCanvasCenter: offsetFromCanvasCenter,
                  object: {
                    type: "anchor",
                    shapeIndex: selectedObject.index,
                    anchorIndex: i,
                    offsetFromCenter: [offsetFromCanvasCenter[0] - anchor[0], offsetFromCanvasCenter[1] - anchor[1]],
                  }
                });
                return;
              }
            }
          }

          // TODO: Give preference to the currently selected rectangle.
          const rectangleIndex = rectangles.length - 1 - [...rectangles].reverse().findIndex(
            (rectangle) =>
              Math.min(rectangle[0][0], rectangle[1][0]) <= offsetFromCanvasCenter[0]
              && offsetFromCanvasCenter[0] <= Math.max(rectangle[0][0], rectangle[1][0])
              && Math.min(rectangle[0][1], rectangle[1][1]) <= offsetFromCanvasCenter[1]
              && offsetFromCanvasCenter[1] <= Math.max(rectangle[0][1], rectangle[1][1])
          );

          if (rectangleIndex < rectangles.length) {
            setDrag({
              initialOffsetFromCanvasCenter: offsetFromCanvasCenter,
              currentOffsetFromCanvasCenter: offsetFromCanvasCenter,
              object: {
                type: "shape",
                index: rectangleIndex,
                offsetFromCenter: [
                  offsetFromCanvasCenter[0] - (rectangles[rectangleIndex][0][0] + rectangles[rectangleIndex][1][0]) / 2,
                  offsetFromCanvasCenter[1] - (rectangles[rectangleIndex][0][1] + rectangles[rectangleIndex][1][1]) / 2
                ]
              }
            });
            setSelectedObject({
              type: "shape",
              index: rectangleIndex,
            });
          } else {
            setDrag({
              initialOffsetFromCanvasCenter: offsetFromCanvasCenter,
              currentOffsetFromCanvasCenter: offsetFromCanvasCenter,
              object: null,
            });
            setSelectedObject(null);
          }
        }
      }
    };

    const mouseMoveWindow = (e: MouseEvent) => {
      if (e.button === 0) {
        const rect = canvas.getBoundingClientRect();
        const offsetFromCanvasCenter = [
          e.clientX - rect.x - rect.width / 2,
          e.clientY - rect.y - rect.height / 2,
        ] as [number, number];

        if (drag && drag.object) {
          if (drag.object.type === "vertex") {
            setVertices([
              ...vertices.slice(0, drag.object.index),
              [
                offsetFromCanvasCenter[0] - drag.object.offsetFromCenter[0],
                offsetFromCanvasCenter[1] - drag.object.offsetFromCenter[1],
              ],
              ...vertices.slice(drag.object.index + 1),
            ]);
          } else if (drag.object.type === "anchor") {
            const { shapeIndex, anchorIndex, offsetFromCenter: offsetFromVertexCenter } = drag.object;
            const newRectangle = [[...rectangles[shapeIndex][0]], [...rectangles[shapeIndex][1]]] as [[number, number], [number, number]];
            newRectangle[anchorIndex] = [offsetFromCanvasCenter[0] - offsetFromVertexCenter[0], offsetFromCanvasCenter[1] - offsetFromVertexCenter[1]];
            setRectangles([
              ...rectangles.slice(0, drag.object.shapeIndex),
              newRectangle,
              ...rectangles.slice(drag.object.shapeIndex + 1),
            ]);
          } else {
            const { index, offsetFromCenter } = drag.object;
            const rectangle = rectangles[index];
            const newRectangle = [
              [
                offsetFromCanvasCenter[0] - offsetFromCenter[0] + (rectangle[0][0] - rectangle[1][0]) / 2,
                offsetFromCanvasCenter[1] - offsetFromCenter[1] + (rectangle[0][1] - rectangle[1][1]) / 2,
              ],
              [
                offsetFromCanvasCenter[0] - offsetFromCenter[0] + (rectangle[1][0] - rectangle[0][0]) / 2,
                offsetFromCanvasCenter[1] - offsetFromCenter[1] + (rectangle[1][1] - rectangle[0][1]) / 2,
              ]
            ] as [[number, number], [number, number]];

            setRectangles([
              ...rectangles.slice(0, index),
              newRectangle,
              ...rectangles.slice(index + 1),
            ]);
          }
        }

        if (drag) {
          setDrag({
            ...drag,
            currentOffsetFromCanvasCenter: offsetFromCanvasCenter,
          });
        }
      }
    };

    const mouseUpWindow = (e: MouseEvent) => {
      if (e.button === 0) {
        const rect = canvas.getBoundingClientRect();
        const offsetFromCanvasCenter = [
          e.clientX - rect.x - rect.width / 2,
          e.clientY - rect.y - rect.height / 2,
        ] as [number, number];

        if (drag) {
          if (drag.object) {
            if (drag.object.type === "vertex") {
              setVertices([
                ...vertices.slice(0, drag.object.index),
                [
                  offsetFromCanvasCenter[0] - drag.object.offsetFromCenter[0],
                  offsetFromCanvasCenter[1] - drag.object.offsetFromCenter[1],
                ],
                ...vertices.slice(drag.object.index + 1),
              ]);
            } else if (drag.object.type === "anchor") {
              const { shapeIndex, anchorIndex, offsetFromCenter: offsetFromVertexCenter } = drag.object;
              const newRectangle = [[...rectangles[shapeIndex][0]], [...rectangles[shapeIndex][1]]] as [[number, number], [number, number]];
              newRectangle[anchorIndex] = [offsetFromCanvasCenter[0] - offsetFromVertexCenter[0], offsetFromCanvasCenter[1] - offsetFromVertexCenter[1]];
              setRectangles([
                ...rectangles.slice(0, drag.object.shapeIndex),
                newRectangle,
                ...rectangles.slice(drag.object.shapeIndex + 1),
              ]);
            } else {
              const { index, offsetFromCenter } = drag.object;
              const rectangle = rectangles[index];
              const newRectangle = [
                [
                  offsetFromCanvasCenter[0] - offsetFromCenter[0] + (rectangle[0][0] - rectangle[1][0]) / 2,
                  offsetFromCanvasCenter[1] - offsetFromCenter[1] + (rectangle[0][1] - rectangle[1][1]) / 2,
                ],
                [
                  offsetFromCanvasCenter[0] - offsetFromCenter[0] + (rectangle[1][0] - rectangle[0][0]) / 2,
                  offsetFromCanvasCenter[1] - offsetFromCenter[1] + (rectangle[1][1] - rectangle[0][1]) / 2,
                ]
              ] as [[number, number], [number, number]];

              setRectangles([
                ...rectangles.slice(0, index),
                newRectangle,
                ...rectangles.slice(index + 1),
              ]);
            }
          } else {
            if (editor === "vertex") {
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
                setSelectedObject({ type: "vertex", index: vertices.length });
                setVertices([...vertices, offsetFromCanvasCenter]);
              }
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
                ) >=
                25
              ) {
                setSelectedObject({ type: "shape", index: rectangles.length });
                setRectangles([...rectangles, [drag.initialOffsetFromCanvasCenter, offsetFromCanvasCenter]]);
              }
            }
          }
        }

        setDrag(null);
      }
    };

    const windowKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedObject !== null) {
        if (selectedObject.type === 'shape') {
          setRectangles([...rectangles.slice(0, selectedObject.index), ...rectangles.slice(selectedObject.index + 1)]);
        } else {
          setVertices([...vertices.slice(0, selectedObject.index), ...vertices.slice(selectedObject.index + 1)]);
        }
        setSelectedObject(null);
      }
    };

    draw();

    canvas.addEventListener("mousedown", mouseDownCanvas);
    window.addEventListener("mousemove", mouseMoveWindow);
    window.addEventListener("mouseup", mouseUpWindow);
    window.addEventListener("keydown", windowKeyDown);
    return () => {
      canvas.removeEventListener("mousedown", mouseDownCanvas);
      window.removeEventListener("mousemove", mouseMoveWindow);
      window.removeEventListener("mouseup", mouseUpWindow);
      window.removeEventListener("keydown", windowKeyDown);
    };
  });

  return (
    <div className="flex">
      <div className="grow overflow-auto bg-slate-200 p-2 space-y-3">
        <div className="flex gap-3">
          <button
            onClick={() => {
              setEditor('shape');
            }}
            className={`${editor === 'shape' ? 'bg-slate-700' : 'bg-slate-500'} text-white p-1 rounded`}
          >
            Shape editor
          </button>
          <button
            onClick={() => {
              setEditor('vertex');
            }}
            className={`${editor === 'vertex' ? 'bg-slate-700' : 'bg-slate-500'} text-white p-1 rounded`}
          >
            Vertex editor
          </button>
        </div>
        {editor === 'vertex' && vertices.length > 0 && (
          <button
            onClick={() => {
              setView('details');
            }}
            className='bg-slate-700 text-white p-1 rounded'
          >
            View persistent homology
          </button>
        )}
        {editor === 'shape' && rectangles.length > 0 && (<div>
          <button
            onClick={() => {
              setDrag(null);
              setSelectedObject(null);

              let minX = Math.min(rectangles[0][0][0], rectangles[0][1][0]);
              let minY = Math.min(rectangles[0][0][1], rectangles[0][1][1]);
              let maxX = Math.max(rectangles[0][0][0], rectangles[0][1][0]);
              let maxY = Math.max(rectangles[0][0][1], rectangles[0][1][1]);
              rectangles.forEach(rectangle => {
                minX = Math.min(minX, rectangle[0][0], rectangle[1][0]);
                minY = Math.min(minY, rectangle[0][1], rectangle[1][1]);
                maxX = Math.max(maxX, rectangle[0][0], rectangle[1][0]);
                maxY = Math.max(maxY, rectangle[0][1], rectangle[1][1]);
              });

              const newVertices: [number, number][] = [];
              for (let _ = 0; _ < 10000; _++) {
                const point = [minX + Math.random() * (maxX - minX), minY + Math.random() * (maxY - minY)] as [number, number];
                const hasPoint = rectangles.some((rectangle) => (
                  Math.min(rectangle[0][0], rectangle[1][0]) <= point[0]
                  && point[0] <= Math.max(rectangle[0][0], rectangle[1][0])
                  && Math.min(rectangle[0][1], rectangle[1][1]) <= point[1]
                  && point[1] <= Math.max(rectangle[0][1], rectangle[1][1])
                ));
                if (hasPoint) {
                  newVertices.push(point);
                  if (newVertices.length >= 100) {
                    break;
                  }
                }
              }
              setVertices(newVertices);
              setEditor('vertex');
            }}
            className={'bg-slate-700 text-white p-1 rounded'}
          >
            Sample random points
          </button>
        </div>)}
        {vertices.length === 0 && <p>Click on the canvas to create vertices.</p>}
      </div>
      <div>
        <canvas ref={canvasRef}></canvas>
      </div>
    </div>
  );
}

function PersistentHomology() {
  const [view, setView] = useState<'editor' | 'details'>('editor');
  const [vertices, setVertices] = useState<[number, number][]>([]);


  if (view === 'details') { return <PersistentHomologyDetails vertices={vertices} setView={setView} />; }
  else { return <PersistentHomologyEditor vertices={vertices} setVertices={setVertices} setView={setView} /> }
}

function App() {
  return (
    <HashRouter>
      <div className="h-10 p-2 flex gap-5 items-center bg-slate-900 text-white">
        <Link to="">Homology</Link>
        <Link to="/persistent">Persistent homology</Link>
      </div>
      <Routes>
        <Route path="" element={<Homology />} />
        <Route path="/persistent" element={<PersistentHomology />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
