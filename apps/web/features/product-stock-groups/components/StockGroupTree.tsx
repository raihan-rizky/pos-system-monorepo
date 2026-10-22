"use client";

import { ArrowRightLeft, Boxes, Info, Package, Plus, Tag } from "lucide-react";
import type { StockGroupWorkspaceContentProps } from "./StockGroupWorkspace";
import styles from "./StockGroupTree.module.css";

const quantity = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 6 });
const currency = new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
});

export function StockGroupTree({
  detail, canUpdateProducts, canCreateProducts, onActiveTabChange,
  isSaving, unitActionsBlocked,
}: Pick<StockGroupWorkspaceContentProps,
  "detail" | "canUpdateProducts" | "canCreateProducts" | "onActiveTabChange" |
  "isSaving" | "unitActionsBlocked"
>) {
  const canManage = canUpdateProducts && onActiveTabChange;
  const conversionPairs = detail.conversionPairs?.filter((pair) =>
    pair.fromUnit.trim().toLowerCase() !== pair.toUnit.trim().toLowerCase()) ?? [];
  return (
    <figure className={styles.tree} aria-label="Pohon persediaan">
      <figcaption className={styles.caption}>
        <div>
          <h3>Pohon persediaan</h3>
          <p>Satu stok bersama, terhubung ke setiap satuan.</p>
        </div>
        {onActiveTabChange && (canUpdateProducts || canCreateProducts) && (
          <div className={styles.actions}>
            {canManage && (
              <button type="button" aria-label="Atur konversi satuan"
                disabled={isSaving || unitActionsBlocked}
                onClick={() => onActiveTabChange("unitManagement")}>
                <ArrowRightLeft aria-hidden="true" size={16} /> Atur konversi
              </button>
            )}
            {canCreateProducts && (
              <button type="button" className={styles.addAction} aria-label="Tambah satuan ke grup"
                disabled={isSaving || unitActionsBlocked}
                onClick={() => onActiveTabChange("newVariant")}>
                <Plus aria-hidden="true" size={16} /> Tambah satuan
              </button>
            )}
          </div>
        )}
      </figcaption>

      <div className={styles.canvas}>
        <div className={styles.map} data-empty={detail.variants.length === 0 || undefined}>
          <section className={styles.root} aria-label="Stok bersama">
            <div className={styles.rootHeading}>
              <span className={styles.rootIcon}><Boxes aria-hidden="true" size={22} /></span>
              <span>Stok bersama</span>
            </div>
            <p className={styles.rootAmount}>{quantity.format(detail.baseStock)}</p>
            <p className={styles.rootUnit}>{detail.baseUnit}</p>
            <div className={styles.rootFooter}>
              <span className={styles.rootDot} aria-hidden="true" />
              {detail.variants.length} satuan · 1 persediaan
            </div>
          </section>

          {detail.variants.length > 0 ? (
            <ul className={styles.branches} role="list" aria-label="Satuan dalam grup">
              {detail.variants.map((variant) => {
                const valid = Number.isFinite(variant.unitMultiplierToBase) && variant.unitMultiplierToBase > 0;
                const sameUnit = variant.unit.trim().toLowerCase() === detail.baseUnit.trim().toLowerCase();
                const isBase = valid && !variant.conversionNeedsReview && variant.unitMultiplierToBase === 1 && sameUnit;
                return (
                  <li key={variant.id} className={styles.branch} aria-label={`Satuan ${variant.unit}`}>
                    <span className={styles.connection} aria-hidden="true" />
                    <article className={styles.node} data-base={isBase || undefined}>
                      <div className={styles.nodeTop}>
                        <div className={styles.unitHeading}>
                          <span className={styles.unitIcon}><Package aria-hidden="true" size={19} /></span>
                          <div className={styles.unitTitle}>
                            <h4>{variant.unit}</h4>
                            {isBase && <span className={styles.baseLabel}>Satuan acuan</span>}
                          </div>
                        </div>
                        <div className={styles.stock}>
                          <span>Stok setara</span>
                          <strong>{valid && Number.isFinite(variant.stock)
                            ? <>{quantity.format(variant.stock)} <small>{variant.unit}</small></>
                            : "Periksa konversi"}</strong>
                        </div>
                      </div>
                      {(!sameUnit || !valid) && (
                        <p className={styles.conversion}>
                          <ArrowRightLeft aria-hidden="true" size={14} />
                          {valid ? `1 ${variant.unit} = ${quantity.format(variant.unitMultiplierToBase)} ${detail.baseUnit}`
                            : "Konversi belum valid"}
                        </p>
                      )}
                      <div className={styles.nodeBottom}>
                        <div className={styles.product}>
                          <p>{variant.name}</p>
                          <span>{variant.sku}</span>
                        </div>
                        <div className={styles.price}>
                          <span>Harga jual</span>
                          <strong>{currency.format(variant.price)}</strong>
                        </div>
                      </div>
                      {(variant.conversionNeedsReview || !valid) && (
                        <p className={styles.warning}>Konversi perlu diperiksa di tab Satuan.</p>
                      )}
                    </article>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className={styles.empty}>
              <Package aria-hidden="true" size={26} />
              <p>Belum ada satuan dalam grup ini</p>
              <span>Tambahkan satuan untuk melihat hubungan konversinya.</span>
            </div>
          )}
        </div>
        <p className={styles.explanation}>
          <Info aria-hidden="true" size={17} />
          <span>Semua satuan memakai persediaan yang sama. Stok setara adalah hasil konversi, bukan stok tambahan.</span>
        </p>
      </div>

      <div className={styles.conversionFooter}>
        <div className={styles.pairContext}>
          <h4>Konversi satuan</h4>
          {!!conversionPairs.length && (
            <ul role="list" aria-label="Hubungan konversi tersimpan">
              {conversionPairs.map((pair) => (
                <li key={`${pair.fromProductId}-${pair.toProductId}`}>{pair.label}</li>
              ))}
            </ul>
          )}
        </div>
        {canManage && (
          <button className={styles.priceAction} type="button" aria-label="Atur harga satuan"
            disabled={isSaving} onClick={() => onActiveTabChange?.("pricing")}>
            <Tag aria-hidden="true" size={16} /> Atur harga
          </button>
        )}
      </div>
    </figure>
  );
}
