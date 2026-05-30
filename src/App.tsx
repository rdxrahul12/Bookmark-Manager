import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";

import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppLoader } from "@/components/AppLoader";
import Index from "./pages/Index";

// 404 page is split off — it should never appear on a happy path.
const NotFound = lazy(() => import("./pages/NotFound"));

const App = () => (
  <ErrorBoundary>
    <TooltipProvider delayDuration={250}>
      <Toaster />
      <HashRouter>
        <Suspense fallback={<AppLoader />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </TooltipProvider>
  </ErrorBoundary>
);

export default App;
