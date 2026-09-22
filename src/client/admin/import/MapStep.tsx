import { useMemo, useState } from "react";
import type { ImportRow, AreaCandidate } from "../../../shared/schemas";
import { ApiError } from "../../api";
import { TYPE_LABELS, copy } from "../../copy";
import { Alert, AlertDescription } from "../../ui/alert";
import { Button } from "../../ui/button";
import { Progress } from "../../ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { MapCanvas } from "./MapCanvas";
import {
  addVertex,
  clickCircle,
  isFull,
  isSearchable,
  isSearchableCircle,
  moveCircleHandle,
  moveVertex,
  removeLastVertex,
} from "./map";
import type { Circle, Vertex } from "./map";
import { useOverpassImport, usePlacesImport } from "../queries";

/** The two map providers. Not `Source`: CSV is not something you draw. */
export type MapProvider = "osm" | "google";

/**
 * Draw an area, see what is in it — docs/design.md, "The map import".
 *
 * Map and results sit side by side because the list is the verdict on the
 * shape: a thin result is answered by moving a vertex and searching again,
 * and a wizard step would hide the map at exactly that moment.
 *
 * The provider sits above the map, not in the toolbar under it (design.md
 * keeps that to one slot): it is not an action, it decides what the canvas
 * *is* — a polygon for Overpass, a circle for Google, because Nearby Search
 * has no polygon search (ADR-0020).
 */
export function MapStep({
  provider,
  onProviderChange,
  progress,
  isRunning,
  error,
  onBack,
  onStart,
}: {
  provider: MapProvider;
  onProviderChange: (provider: MapProvider) => void;
  progress: { done: number; total: number };
  isRunning: boolean;
  error: string | null;
  onBack: () => void;
  onStart: (rows: ImportRow[]) => void;
}) {
  const [polygon, setPolygon] = useState<Vertex[]>([]);
  const [circle, setCircle] = useState<Circle | null>(null);
  const overpass = useOverpassImport();
  const places = usePlacesImport();

  const google = provider === "google";
  const search = google ? places : overpass;
  const drawn = google ? isSearchableCircle(circle) : isSearchable(polygon);

  /**
   * Switching provider starts the drawing over. A polygon is not a circle, and
   * leaving the previous provider's results on screen beside a blank canvas
   * would make them look like an answer about the new one.
   */
  function chooseProvider(next: MapProvider) {
    setPolygon([]);
    setCircle(null);
    overpass.reset();
    places.reset();
    onProviderChange(next);
  }

  function runSearch() {
    if (google) {
      if (isSearchableCircle(circle)) places.mutate(circle);
      return;
    }
    if (isSearchable(polygon)) overpass.mutate(polygon);
  }

  function clearShape() {
    setPolygon([]);
    setCircle(null);
  }

  // A place OSM has no name for cannot be imported: `name` is required by the
  // contract (docs/domains/ingestion.md, "Unnamed elements"). Both lists are
  // derived from one memo, so `?? []` cannot mint a new array every render.
  const { candidates, importable } = useMemo(() => {
    const found = search.data?.candidates ?? [];
    return { candidates: found, importable: found.filter((c) => c.named) };
  }, [search.data]);
  const unnamed = candidates.length - importable.length;
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div>
        {/* The provider decides what the canvas is, so it sits above it. */}
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <label className="text-muted-foreground" htmlFor="map-provider">
            {copy.map.provider.label}
          </label>
          <Select
            value={provider}
            onValueChange={(next) => chooseProvider(next as MapProvider)}
            disabled={search.isPending || isRunning}
          >
            <SelectTrigger id="map-provider" className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="osm">{copy.map.provider.osm}</SelectItem>
              <SelectItem value="google">{copy.map.provider.google}</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground basis-full text-xs">
            {google ? copy.map.provider.googleHint : copy.map.provider.osmHint}
          </span>
        </div>

        <p className="text-muted-foreground mb-2">
          {google ? copy.map.circle.lede : copy.map.lede}
        </p>
        <MapCanvas
          mode={google ? "circle" : "polygon"}
          polygon={polygon}
          circle={circle}
          onMapClick={(point) => {
            if (google) setCircle((current) => clickCircle(current, point));
            else setPolygon((current) => addVertex(current, point));
          }}
          onHandleDrag={(index, to) => {
            if (google)
              setCircle((current) => (current ? moveCircleHandle(current, index, to) : current));
            else setPolygon((current) => moveVertex(current, index, to));
          }}
        />

        {/* One toolbar slot, under the map: the standing fact on the left, the
            action on the right. Never floating over the canvas (design.md). */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground tnum">
            {google ? (
              circle ? (
                `${copy.map.circle.radius(circle.radius)} · ${copy.map.circle.hint}`
              ) : (
                copy.map.circle.none
              )
            ) : (
              <>
                {copy.map.vertices(polygon.length)}
                {!isSearchable(polygon) && polygon.length > 0 && ` · ${copy.map.needMore}`}
                {isFull(polygon) && ` · ${copy.map.full}`}
              </>
            )}
          </span>
          <span className="ml-auto flex gap-2">
            {/* Undoing a point is a polygon idea: a circle has two handles and
                no history to walk back. */}
            {!google && (
              <Button
                variant="ghost"
                onClick={() => setPolygon(removeLastVertex)}
                disabled={polygon.length === 0 || isRunning}
              >
                {copy.map.undo}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={clearShape}
              disabled={(google ? circle === null : polygon.length === 0) || isRunning}
            >
              {copy.map.clear}
            </Button>
            <Button onClick={runSearch} disabled={!drawn || search.isPending || isRunning}>
              {search.isPending ? copy.map.searching : copy.map.search}
            </Button>
          </span>
        </div>

        {search.isError && (
          <Alert variant="destructive" className="mt-3" role="alert">
            <AlertDescription>{searchError(search.error)}</AlertDescription>
          </Alert>
        )}
      </div>

      <div>
        {!search.data && !search.isPending && (
          <p className="text-muted-foreground">
            {google ? copy.map.results.idleGoogle : copy.map.results.idle}
          </p>
        )}

        {search.data && (
          <>
            <div className="mb-3 flex gap-6">
              <span>
                <strong className="text-display tnum block font-semibold">
                  {importable.length}
                </strong>
                <span className="text-muted-foreground">
                  {copy.map.results.found(importable.length)}
                </span>
              </span>
              {unnamed > 0 && (
                <span>
                  <strong className="text-display tnum text-muted-foreground block font-semibold">
                    {unnamed}
                  </strong>
                  <span className="text-muted-foreground">{copy.map.results.unnamed(unnamed)}</span>
                </span>
              )}
            </div>

            {search.data.cached && (
              <p className="text-muted-foreground mb-2 text-xs">{copy.map.results.cached}</p>
            )}
            {search.data.truncated && (
              <Alert className="mb-2">
                <AlertDescription>
                  {google ? copy.map.results.truncatedGoogle : copy.map.results.truncated}
                </AlertDescription>
              </Alert>
            )}

            {/* Google's terms ask for its attribution wherever its content is
                shown. The tiles stay OpenStreetMap's, and so does theirs. */}
            {google && (
              <p className="text-muted-foreground mb-2 text-xs">
                {copy.map.results.poweredByGoogle}
              </p>
            )}

            {candidates.length === 0 ? (
              <p className="text-muted-foreground">{copy.map.results.empty}</p>
            ) : (
              <ul className="border-border bg-card divide-border max-h-[28rem] divide-y overflow-y-auto rounded-md border">
                {candidates.map((candidate) => (
                  <CandidateRow key={candidate.sourceRef} candidate={candidate} />
                ))}
              </ul>
            )}
          </>
        )}

        {isRunning && (
          <div className="mt-4">
            <Progress value={percent} />
            <p className="text-muted-foreground tnum mt-2">
              {copy.import.running(progress.done, progress.total)}
            </p>
          </div>
        )}

        {error && !isRunning && (
          <Alert variant="destructive" className="mt-4" role="alert">
            <AlertDescription>{copy.import.failed}</AlertDescription>
          </Alert>
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={onBack} disabled={isRunning}>
            {copy.import.actions.back}
          </Button>
          {search.data && (
            <Button
              onClick={() => onStart(importable.map(toImportRow))}
              disabled={isRunning || importable.length === 0}
            >
              {error ? copy.import.actions.retry : copy.map.results.start(importable.length)}
            </Button>
          )}
        </div>
        {search.data && importable.length === 0 && candidates.length > 0 && (
          <p className="text-muted-foreground mt-2">{copy.map.results.nothingToImport}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Which failure the admin is looking at.
 *
 * A missing key is not an outage: nobody has configured the provider, another
 * one is available, and saying "Google did not answer" would send them to
 * refresh a page that will never work (ADR-0020).
 */
function searchError(error: unknown): string {
  if (error instanceof ApiError && error.code === "places_unconfigured") {
    return copy.map.placesUnconfigured;
  }
  if (error instanceof ApiError && error.code === "places_failed") return copy.map.placesFailed;
  return copy.map.failed;
}

/**
 * One found place. Same leading edge as the prospect ledger — `status-new` for
 * something that will be imported, `status-rejected` for one that cannot be —
 * so the panel scans like every other list in this app (design.md).
 */
function CandidateRow({ candidate }: { candidate: AreaCandidate }) {
  return (
    <li
      className={
        candidate.named
          ? "px-3 py-2 shadow-[inset_4px_0_0_0_var(--color-status-new)]"
          : "text-muted-foreground px-3 py-2 shadow-[inset_4px_0_0_0_var(--color-status-rejected)]"
      }
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className={candidate.named ? "font-medium" : "decoration-border line-through"}>
          {candidate.named ? candidate.name : copy.map.results.noName}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs">
          {TYPE_LABELS[candidate.type]}
        </span>
      </span>
      {candidate.address && (
        <span className="text-muted-foreground block text-xs">{candidate.address}</span>
      )}
    </li>
  );
}

/** A named candidate is an import row; `named` and the empty-name case are gone. */
function toImportRow(candidate: AreaCandidate): ImportRow {
  return {
    name: candidate.name,
    type: candidate.type,
    lat: candidate.lat,
    lng: candidate.lng,
    address: candidate.address,
    phone: candidate.phone,
    website: candidate.website,
    cuisine: candidate.cuisine,
    sourceRef: candidate.sourceRef,
  };
}
