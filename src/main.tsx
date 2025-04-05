import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import { Toaster } from "@/components/ui/sonner";

import "./index.css";
import 'simplebar/dist/simplebar.min.css';

// Create a router with routes
const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
  }
]);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <Toaster position="top-right" />
  </React.StrictMode>,
);
