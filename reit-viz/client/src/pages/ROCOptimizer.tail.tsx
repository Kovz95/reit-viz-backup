                                                  {pctSigned(cat.summary.avgReturn[h.label])}
                                                </td>
                                                <td className={`text-center px-1 py-0.5 ${cat.summary.medianReturn[h.label] >= 0 ? "text-green-400" : "text-red-400"}`}>
                                                  {pctSigned(cat.summary.medianReturn[h.label])}
                                                </td>
                                                <td className="text-center px-1 py-0.5 text-green-400">
                                                  {pctSigned(cat.summary.avgPeak[h.label])}
                                                </td>
                                                <td className="text-center px-1 py-0.5 text-red-400">
                                                  {pctSigned(cat.summary.avgTrough[h.label])}
                                                </td>
                                                <td className={`text-center px-1 py-0.5 ${profitFactorColor(cat.summary.profitFactor[h.label])}`}>
                                                  {cat.summary.profitFactor[h.label] >= 99
                                                    ? "∞"
                                                    : cat.summary.profitFactor[h.label].toFixed(2)}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                        {/* Signal dates table */}
                                        {isExpSig && (
                                          <div className="mt-1 border border-border/40 rounded overflow-hidden">
                                            {extra > 0 && (
                                              <div className="px-2 py-0.5 text-[8px] font-mono text-muted-foreground bg-card/50">
                                                + {extra} older signals not shown
                                              </div>
                                            )}
                                            <table className="w-full text-[9px] font-mono">
                                              <thead className="bg-card">
                                                <tr className="text-muted-foreground">
                                                  <th className="text-left px-2 py-0.5">Date</th>
                                                  <th className="text-right px-2 py-0.5">1M</th>
                                                  <th className="text-right px-2 py-0.5">3M</th>
                                                  <th className="text-right px-2 py-0.5">6M</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {shown.map((sd: any, sdIdx: number) => (
                                                  <tr key={sdIdx} className="border-t border-border/20">
                                                    <td className="px-2 py-0.5 text-foreground">{sd.date}</td>
                                                    <td className={`px-2 py-0.5 text-right ${sd.ret1m !== null ? sd.ret1m >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground/40"}`}>
                                                      {sd.ret1m !== null ? pctSigned(sd.ret1m) : "—"}
                                                    </td>
                                                    <td className={`px-2 py-0.5 text-right ${sd.ret3m !== null ? sd.ret3m >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground/40"}`}>
                                                      {sd.ret3m !== null ? pctSigned(sd.ret3m) : "—"}
                                                    </td>
                                                    <td className={`px-2 py-0.5 text-right ${sd.ret6m !== null ? sd.ret6m >= 0 ? "text-green-400" : "text-red-400" : "text-muted-foreground/40"}`}>
                                                      {sd.ret6m !== null ? pctSigned(sd.ret6m) : "—"}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                        {/* Hit conditions evaluator */}
                                        {isExpHitCond && tickerData.priceContext && cat.profiles ? (
                                          <div className="mt-2">
                                            <EvaluatorPanelLoader
                                              ticker={
                                                tickerData.priceContext.mode === "pair" && tickerData.priceContext.pairLegA
                                                  ? tickerData.priceContext.pairLegA
                                                  : tickerData.ticker
                                              }
                                              priceContext={tickerData.priceContext}
                                              signals={cat.profiles}
                                              direction={direction}
                                              title={`${cfg.configLabel} — ${cat.label}`}
                                              useBand={returnMode === "band"}
                                            />
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
              </div>
            )}

            {/* Loading state when optimize running */}
            {running && filteredSortedResults.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">
                  Running… {progress.current} / {progress.total}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
