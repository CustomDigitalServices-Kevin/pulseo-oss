import { describe, it, expect } from "vitest";
import { DOCUMENT_CATEGORIES, uploadDocumentInputSchema } from "./documents";

const validUuid = "550e8400-e29b-41d4-a716-446655440000";

describe("Module projets — DOCUMENT_CATEGORIES (UX overhaul)", () => {
  it("contient les 7 catégories attendues", () => {
    expect(DOCUMENT_CATEGORIES).toEqual([
      "cdc",
      "spec_tech",
      "doc_user",
      "devis",
      "facture",
      "recette",
      "autre",
    ]);
  });

  it("accepte la nouvelle catégorie `spec_tech`", () => {
    const r = uploadDocumentInputSchema.safeParse({
      projectId: validUuid,
      category: "spec_tech",
      originalName: "Specs API v1.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
    });
    expect(r.success).toBe(true);
  });

  it("accepte la nouvelle catégorie `doc_user`", () => {
    const r = uploadDocumentInputSchema.safeParse({
      projectId: validUuid,
      category: "doc_user",
      originalName: "Guide utilisateur.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
    });
    expect(r.success).toBe(true);
  });

  it("reste rétro-compatible avec les anciennes catégories", () => {
    const olds = ["cdc", "devis", "facture", "recette", "autre"] as const;
    for (const c of olds) {
      const r = uploadDocumentInputSchema.safeParse({
        projectId: validUuid,
        category: c,
        originalName: "file.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
      });
      expect(r.success).toBe(true);
    }
  });

  it("refuse une catégorie inconnue", () => {
    const r = uploadDocumentInputSchema.safeParse({
      projectId: validUuid,
      category: "random_unknown",
      originalName: "file.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
    });
    expect(r.success).toBe(false);
  });
});
