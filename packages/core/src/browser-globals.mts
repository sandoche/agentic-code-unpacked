declare global {
  interface Window {
    walkthroughPresentation: {
      showStep(index: number): { id: string | undefined; index: number; overflow: boolean };
      pause(): void;
      readonly activeStep: number;
    };
  }
}
export {};
