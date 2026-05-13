
import { LegalDocumentParams } from "../../../types";
import { generateConfissaoDividaV2HTML } from "./ConfissaoDividaV2Template";

/**
 * @deprecated Use generateConfissaoDividaV2HTML directly for the improved "Winner Text" template.
 * This remains for backward compatibility but routes to the newer version.
 */
export const generateConfissaoDividaHTML = (data: LegalDocumentParams, docId?: string, hash?: string, signatures: any[] = []) => {
    return generateConfissaoDividaV2HTML(data, docId, hash, signatures);
};
