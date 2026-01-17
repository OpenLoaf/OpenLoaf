declare module "mammoth/mammoth.browser" {
  const mammoth: {
    extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value?: string | null }>;
  };
  export default mammoth;
}
