// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

describe("Card", () => {
  it("renders label and value", () => {
    render(<Card label="Vendidos" value="42" />);
    expect(screen.getByText("Vendidos")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
  });
});

describe("Button", () => {
  it("shows loading text when loading", () => {
    render(<Button loading>Salvar</Button>);
    expect(screen.getByText("Carregando...")).toBeDefined();
  });

  it("is disabled when loading", () => {
    render(<Button loading>Salvar</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("Input", () => {
  it("shows error message", () => {
    render(<Input error="Campo obrigatório" />);
    expect(screen.getByText("Campo obrigatório")).toBeDefined();
  });
});