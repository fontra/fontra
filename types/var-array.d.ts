export default class VarArray extends Array<number> {
  copy(): VarArray;
  addItemwise(other: VarArray): VarArray;
  subItemwise(other: VarArray): VarArray;
  mulScalar(scalar: number): VarArray;
}
