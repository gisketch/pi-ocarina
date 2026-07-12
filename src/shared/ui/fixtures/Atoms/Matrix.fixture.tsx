import { CellMatrix, MatrixSpinner, ProceduralAvatar } from "@/shared/ui/cell-matrix";
import { MatrixBackground } from "@/shared/ui/matrix-background";

export default <div className="relative grid min-h-64 place-items-center gap-5 overflow-hidden rounded-lg border p-8">
  <MatrixBackground className="absolute inset-0" />
  <div className="relative flex items-center gap-6 text-primary"><CellMatrix cells="110011011001111111100110011011" columns={6} rows={5} label="Cell matrix" /><ProceduralAvatar seed="cosmos" label="Cosmos avatar" /><MatrixSpinner label="Loading" /></div>
</div>;
