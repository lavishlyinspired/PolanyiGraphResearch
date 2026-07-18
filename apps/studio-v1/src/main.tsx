import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ValidatorPage } from "@/pages/Validator/ValidatorPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ValidatorPage />
  </StrictMode>,
);
