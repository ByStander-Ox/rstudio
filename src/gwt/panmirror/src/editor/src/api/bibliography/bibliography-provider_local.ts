/*
 * bibliography-provider_local.ts
 *
 * Copyright (C) 2020 by RStudio, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */
import { Node as ProsemirrorNode, Schema } from 'prosemirror-model';
import { Transaction } from 'prosemirror-state';

import { PandocServer } from "../pandoc";

import { expandPaths, getExtension, joinPaths } from "../path";
import { EditorUI } from "../ui";

import { BibliographyDataProvider, Bibliography, BibliographySource, BibliographyFile, BibliographyContainer } from "./bibliography";
import { ParsedYaml, parseYamlNodes } from '../yaml';
import { toBibLaTeX } from './bibDB';
import { CSL } from '../csl';


export interface BibliographyResult {
  etag: string;
  bibliography: Bibliography;
}
export const kLocalBiliographyProviderKey = "E06068FE-45DA-4D88-ABDA-0DF290624950";

export class BibliographyDataProviderLocal implements BibliographyDataProvider {

  private etag: string;
  private bibliography?: Bibliography;
  private readonly server: PandocServer;

  public constructor(server: PandocServer) {
    this.server = server;
    this.etag = '';
  }
  public name: string = "Bibliography";
  public key: string = kLocalBiliographyProviderKey;

  public async load(docPath: string | null, resourcePath: string, yamlBlocks: ParsedYaml[]): Promise<boolean> {
    // Gather the biblography files from the document
    const bibliographiesRelative = bibliographyFilesFromDoc(yamlBlocks);
    const bibliographiesAbsolute = expandPaths(resourcePath, bibliographiesRelative || []);

    // Gather the reference block
    const refBlock = referenceBlockFromYaml(yamlBlocks);

    let updateIndex = false;
    if (docPath || bibliographiesAbsolute.length > 0 || refBlock) {
      // get the bibliography
      try {
        const result = await this.server.getBibliography(docPath, bibliographiesAbsolute, refBlock, this.etag);

        // Read bibliography data from files (via server)
        if (!this.bibliography || result.etag !== this.etag) {
          this.bibliography = result.bibliography;
          updateIndex = true;
        }

        // record the etag for future queries
        this.etag = result.etag;
      } catch (e) {
        // ignore error
      }
    }
    return updateIndex;
  }

  public containers(doc: ProsemirrorNode, ui: EditorUI): BibliographyContainer[] {
    return [];

    // TODO: If we can make the 'itemsForCollections' call work, we can begin emitting the various
    // bibliography files here. Right now, the server generates the CSL for all the bibligraphy runs
    // in a single call, meaning that the items lose context of which bibliography file that they
    // come from.
    /*
    if (!this.bibliography || !this.bibliography.sources) {
      return [];
    }

    if (this.projectBiblios().length > 0) {
      return this.projectBiblios().map(biblio => ({ name: biblio, key: biblio }));
    }

    const bibliographies = bibliographyFilesFromDocument(doc, ui);
    return bibliographies ? bibliographies.map(biblio => ({ name: biblio, key: biblio })) : [];
    */
  }


  public items(): BibliographySource[] {

    if (!this.bibliography || !this.bibliography.sources) {
      return [];
    }

    return this.bibliography.sources.map(source => ({
      ...source,
      id: source.id!, // Local CSL always has an id
      providerKey: this.key,
      collectionKeys: []
    }));
  }

  public itemsForCollection(collectionKey: string): BibliographySource[] {
    // TODO: Need to filter by biblio file
    return [];
  }

  public projectBiblios(): string[] {
    return this.bibliography?.project_biblios || [];
  }

  public generateBibLaTeX(_ui: EditorUI, id: string, csl: CSL): Promise<string | undefined> {
    return Promise.resolve(toBibLaTeX(id, csl));
  }

  public warningMessage(): string | undefined {
    return undefined;
  }

  public bibliographyPaths(doc: ProsemirrorNode, ui: EditorUI): BibliographyFile[] {

    const kPermissableFileExtensions = ['bib', 'yaml', 'yml', 'json'];
    if (this.bibliography?.project_biblios
      && this.bibliography.project_biblios.length > 0) {
      return this.bibliography?.project_biblios.map(projectBiblio => {
        return {
          displayPath: projectBiblio,
          fullPath: projectBiblio,
          isProject: true,
          writable: kPermissableFileExtensions.includes(getExtension(projectBiblio))
        };
      });
    }
    return bibliographyFilesFromDocument(doc, ui)?.map(path => {
      return {
        displayPath: path,
        fullPath: joinPaths(ui.context.getDefaultResourceDir(), path),
        isProject: false,
        writable: kPermissableFileExtensions.includes(getExtension(path))
      };
    }) || [];
  }
}

function bibliographyFilesFromDocument(doc: ProsemirrorNode, ui: EditorUI): string[] | undefined {
  // Gather the files from the document
  return bibliographyFilesFromDoc(parseYamlNodes(doc));
}

function bibliographyFilesFromDoc(parsedYamls: ParsedYaml[]): string[] | undefined {
  const bibliographyParsedYamls = parsedYamls.filter(
    parsedYaml => parsedYaml.yaml !== null && typeof parsedYaml.yaml === 'object' && parsedYaml.yaml.bibliography,
  );

  // Look through any yaml nodes to see whether any contain bibliography information
  if (bibliographyParsedYamls.length > 0) {
    // Pandoc will use the last biblography node when generating a bibliography.
    // So replicate this and use the last biblography node that we find
    const bibliographyParsedYaml = bibliographyParsedYamls[bibliographyParsedYamls.length - 1];
    const bibliographyFiles = bibliographyParsedYaml.yaml.bibliography;

    if (
      Array.isArray(bibliographyFiles) &&
      bibliographyFiles.every(bibliographyFile => typeof bibliographyFile === 'string')) {
      return bibliographyFiles;
    } else {
      // A single bibliography
      return [bibliographyFiles];
    }
  }
  return undefined;
}

function referenceBlockFromYaml(parsedYamls: ParsedYaml[]): string {
  const refBlockParsedYamls = parsedYamls.filter(
    parsedYaml => parsedYaml.yaml !== null && typeof parsedYaml.yaml === 'object' && parsedYaml.yaml.references,
  );

  // Pandoc will use the last references node when generating a bibliography.
  // So replicate this and use the last biblography node that we find
  if (refBlockParsedYamls.length > 0) {
    const lastReferenceParsedYaml = refBlockParsedYamls[refBlockParsedYamls.length - 1];
    if (lastReferenceParsedYaml) {
      return lastReferenceParsedYaml.yamlCode;
    }
  }

  return '';
}



const kSpaceOrColonRegex = /[\s:]/;
function bibliographyLine(bibliographyFile: string): string {
  const sketchyCharMatch = bibliographyFile.match(kSpaceOrColonRegex);
  if (sketchyCharMatch) {
    return `bibliography: "${bibliographyFile}"`;
  } else {
    return `bibliography: ${bibliographyFile}`;
  }
}

export function ensureBibliographyFileForDoc(tr: Transaction, bibliographyFile: string, ui: EditorUI) {

  // read the Yaml blocks from the document
  const parsedYamlNodes = parseYamlNodes(tr.doc);

  // Gather the biblography files from the document
  const bibliographiesRelative = bibliographyFilesFromDoc(parsedYamlNodes);
  if (bibliographiesRelative && bibliographiesRelative.length > 0) {
    // The user selected bibliography is already in the document OR
    // There is a bibliography entry, but it doesn't include the user
    // selected bibliography. In either case, we're not going to write
    // a bibliography entry to any YAML node. 
    return bibliographiesRelative.includes(bibliographyFile);
  } else {
    // There aren't any bibliographies declared for this document yet either because
    // there are no yaml metadata blocks or the yaml metadata blocks that exist omit
    // the bibliography property
    if (parsedYamlNodes.length === 0) {
      // There aren't any yaml nodes in this document, need to create one
      const biblioNode = createBiblographyYamlNode(tr.doc.type.schema, bibliographyFile);
      tr.insert(1, biblioNode);

    } else {

      // We found at least one node in the document, add to the first node that we found
      const firstBlock = parsedYamlNodes[0];
      const updatedNode = addBibliographyToYamlNode(tr.doc.type.schema, bibliographyFile, firstBlock);
      tr.replaceRangeWith(firstBlock.node.pos, firstBlock.node.pos + firstBlock.node.node.nodeSize, updatedNode);

    }
    return true;
  }
}


function addBibliographyToYamlNode(schema: Schema, bibliographyFile: string, parsedYaml: ParsedYaml) {
  // Add this to the first node
  const yamlCode = parsedYaml.yamlCode;
  const yamlWithBib = `---\n${yamlCode}\n${bibliographyLine(bibliographyFile)}\n---`;
  const yamlText = schema.text(yamlWithBib);
  return schema.nodes.yaml_metadata.create({}, yamlText);
}

function createBiblographyYamlNode(schema: Schema, bibliographyFile: string) {
  const yamlText = schema.text(`---\n${bibliographyLine(bibliographyFile)}\n---`);
  return schema.nodes.yaml_metadata.create({}, yamlText);
}

