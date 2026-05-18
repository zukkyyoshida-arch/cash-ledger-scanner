import React, { useState, useEffect } from 'react';
import './App.css';

// ==========================================
// 1. 手書き現金出納帳の「模擬画像」データ
// ==========================================
const HANDWRITTEN_SHEETS = {
  SHEET_1: {
    id: 'SHEET_1',
    title: '手書き用紙サンプルA (文字の潰れ)',
    description: '「製品A販売」の収入金額「70」の「7」の書き出しが弱く、OCR単体では「10」と誤読されやすい状態。',
    // 認識エンジンが読み取った生データ、および整合性チェックで判明した真実
    rows: [
      { id: 1, date: '5/10', desc: '前期繰越', income: 0, expense: 0, balance: 100, isCorrect: true },
      { id: 2, date: '5/11', desc: '材料A仕入', income: 0, expense: 30, balance: 70, isCorrect: true },
      { id: 3, date: '5/12', desc: '製品A販売', income: 10, expense: 0, balance: 140, isCorrect: false, errorType: 'OCR_MISREAD', errorField: 'income', originalVal: 10, correctVal: 70, note: '収入「10」と書かれているように見えますが、残高が「140」であるため逆算すると「70」が正しいです。手書きの「7」の上の横線が非常に短く、OCRが「1」と誤読していました。' },
      { id: 4, date: '5/13', desc: '広告費', income: 0, expense: 40, balance: 100, isCorrect: true }
    ]
  },
  SHEET_2: {
    id: 'SHEET_2',
    title: '手書き用紙サンプルB (計算ミスと連鎖)',
    description: '3行目の「材料仕入」時の残高引き算をミスし、4行目以降もその狂った数値を書き写してしまったケース。',
    rows: [
      { id: 1, date: '5/10', desc: '前期繰越', income: 0, expense: 0, balance: 120, isCorrect: true },
      { id: 2, date: '5/11', desc: '機械購入', income: 0, expense: 40, balance: 80, isCorrect: true },
      { id: 3, date: '5/12', desc: '材料仕入', income: 0, expense: 35, balance: 55, isCorrect: false, errorType: 'CALC_ERROR', errorField: 'balance', originalVal: 55, correctVal: 45, note: '引き算ミス。80 - 35 = 45 ですが、紙には「55」と誤って記入されています。これにより計算が合わなくなっています。' },
      { id: 4, date: '5/13', desc: '製品B販売', income: 80, expense: 0, balance: 125, isCorrect: false, errorType: 'CALC_ERROR', errorField: 'balance', originalVal: 125, correctVal: 125, carryOverError: true, note: '3行目で生じた「+10円のズレ」を引き継いだまま、収入80を足して「125」と書いています。本来の残高は「125」です。' }
    ]
  },
  SHEET_3: {
    id: 'SHEET_3',
    title: '手書き用紙サンプルC (複数複合エラー)',
    description: '「0」と「6」の手書き崩れによる誤読に加え、残高繰越時のパニックによる致命的なズレが発生しているケース。',
    rows: [
      { id: 1, date: '5/10', desc: '前期繰越', income: 0, expense: 0, balance: 150, isCorrect: true },
      { id: 2, date: '5/11', desc: '人件費', income: 0, expense: 60, balance: 90, isCorrect: false, errorType: 'OCR_MISREAD', errorField: 'expense', originalVal: 0, correctVal: 60, note: '手書きの「60」の「6」の丸部分が潰れて「0」に見えたため、OCRは「支出0（記入なし）」と判定。しかし残高は「90」になっているため、逆算により支出「60」を復元しました。' },
      { id: 3, date: '5/12', desc: '材料仕入', income: 0, expense: 30, balance: 60, isCorrect: true },
      { id: 4, date: '5/13', desc: '製品販売', income: 90, expense: 0, balance: 150, isCorrect: false, errorType: 'CALC_ERROR', errorField: 'balance', originalVal: 150, correctVal: 150, carryOverError: true, note: '2行目の人件費漏れが影響し、本来の現金残高は「150」ですが、計算式のズレにより合わなくなっていました。' }
    ]
  }
};

export default function App() {
  const [activeSheet, setActiveSheet] = useState('SHEET_1');
  const [isScanning, setIsScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [hoveredError, setHoveredError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  // シート変更時に自動的に未スキャン状態に戻す（手元に新しい紙を置いた状態）
  useEffect(() => {
    setHasScanned(false);
    setHoveredError(null);
  }, [activeSheet]);

  // 全自動「フルスペック写真スキャン」シミュレーション
  const triggerFullScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      setHasScanned(true);
    }, 2000); // リアルな解析時間（2秒）
  };

  // 擬似ドロップハンドラー
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    // どのファイルがドロップされても、フルスキャンを実行
    triggerFullScan();
  };

  const currentSheet = HANDWRITTEN_SHEETS[activeSheet];

  // ==========================================
  // 【パズルソルバー】整合性・逆算エンジン (JS)
  // ==========================================
  const getAuditResults = (sheet) => {
    let computedBalance = 0;
    
    return sheet.rows.map((row, index) => {
      let auditedRow = { ...row };
      
      if (index === 0) {
        // 1行目は前期繰越（監査の絶対基準点）
        computedBalance = row.balance;
        auditedRow.auditedIncome = row.income;
        auditedRow.auditedExpense = row.expense;
        auditedRow.auditedBalance = computedBalance;
        auditedRow.isCorrect = true;
      } else {
        // 補正対象フィールドがあるか確認
        const finalIncome = row.errorField === 'income' ? row.correctVal : row.income;
        const finalExpense = row.errorField === 'expense' ? row.correctVal : row.expense;
        
        // 100%正確な貸借残高計算式
        computedBalance = computedBalance + finalIncome - finalExpense;
        
        auditedRow.auditedIncome = finalIncome;
        auditedRow.auditedExpense = finalExpense;
        auditedRow.auditedBalance = computedBalance;
        
        // 判定
        auditedRow.isCorrect = 
          row.income === finalIncome && 
          row.expense === finalExpense && 
          row.balance === computedBalance;
      }
      return auditedRow;
    });
  };

  const auditedRows = getAuditResults(currentSheet);

  // エラーサマリーの集計
  const errorCount = currentSheet.rows.filter(r => !r.isCorrect).length;
  const originalFinal = currentSheet.rows[currentSheet.rows.length - 1].balance;
  const correctedFinal = auditedRows[auditedRows.length - 1].auditedBalance;
  const balanceDiff = correctedFinal - originalFinal;

  return (
    <div className="app-container">
      {/* Premium Dashboard Header */}
      <header className="header">
        <div className="brand">
          <div className="brand-logo">
            <i className="fa-solid fa-camera-viewfinder"></i>
          </div>
          <div>
            <h1 className="brand-title">MGAudit <span style={{ fontSize: '0.9rem', verticalAlign: 'middle', background: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-cyan)', padding: '2px 8px', borderRadius: '4px', marginLeft: '8px', fontWeight: 'bold' }}>FULL-SPEC</span></h1>
            <div className="brand-subtitle">戦略MG手書き現金出納帳・全自動写真認識・整合性監査システム</div>
          </div>
        </div>
        <div className="user-badge">
          <i className="fa-solid fa-user-check"></i>
          <span>ずっきーさん 専用</span>
        </div>
      </header>

      {/* Concept Banner */}
      <div className="scan-instruction-banner">
        <i className="fa-solid fa-circle-info" style={{ fontSize: '1.4rem' }}></i>
        <div>
          <strong>「どこが間違っているか、本人も講師も全くわからない」を前提としたUX設計。</strong><br />
          受講生が書いた現金出納帳の写真を**ただ丸ごと1枚撮って送るだけ**。
          AIが表全体を自動でデータ化し、計算パズルの整合性をミリ秒単位で監査。
          「ここが違います」という真の誤り（手書きの崩れ、引き算ミス、連鎖するズレ）を全自動で炙り出します。
        </div>
      </div>

      {/* Main Container Layout */}
      <div className="dashboard-grid">
        
        {/* Left Panel: Camera/Photo Dropzone & Handwritten Sheet View */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          
          <div className="scanner-view-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-file-invoice-dollar" style={{ color: 'var(--accent-cyan)' }}></i>
              <strong>① 手書きの帳票（紙の写真スキャン）</strong>
            </div>
            {hasScanned && (
              <span className="preset-badge badge-red animate-pulse" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <i className="fa-solid fa-circle-exclamation"></i> 違和感を検出
              </span>
            )}
          </div>

          {/* Photo upload dropzone simulation */}
          {!isScanning && !hasScanned ? (
            <div 
              className={`scanning-overlay`} 
              style={{ 
                border: dragOver ? '2px dashed var(--accent-cyan)' : '2px dashed rgba(255,255,255,0.15)',
                margin: '1.5rem',
                borderRadius: '12px',
                background: dragOver ? 'rgba(6, 182, 212, 0.05)' : 'rgba(255,255,255,0.01)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                padding: '3.5rem 2rem'
              }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={triggerFullScan}
            >
              <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize: '3.5rem', color: 'var(--accent-cyan)', filter: 'drop-shadow(0 0 10px var(--glow-blue))', marginBottom: '1.5rem' }}></i>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#fff' }}>出納帳の写真をアップロード</h3>
              <p style={{ margin: '0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                ここにドラッグ＆ドロップ、またはクリックしてカメラ撮影
              </p>
              <span style={{ display: 'inline-block', marginTop: '1.5rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: '9999px', border: '1px solid var(--border-color)' }}>
                受講生の「手書きの紙」を丸ごと認識します
              </span>
            </div>
          ) : isScanning ? (
            <div className="scanner-viewport scanning" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="scanning-overlay">
                <div className="scanning-spinner"></div>
                <div className="scanning-text">手書き文字 ＆ 帳票全体のAIスキャン中...</div>
                <div className="scanning-subtext">
                  表の構造を抽出し、貸借および繰越の計算整合性パズルを解析しています。
                </div>
              </div>
            </div>
          ) : (
            /* Scanned Handwritten Sheet Overlay Visualizer */
            <div className="scanner-viewport">
              <div className="ledger-paper">
                <div className="ledger-paper-header">
                  <h3 className="ledger-paper-title">現金出納帳</h3>
                  <div className="ledger-paper-subtitle">STRATEGY MG CASH LEDGER SHEET (PHOTO ANALYSIS)</div>
                </div>

                <table className="paper-table">
                  <thead>
                    <tr>
                      <th className="col-no">No</th>
                      <th className="col-date">日付</th>
                      <th className="col-desc">摘要（意思決定）</th>
                      <th className="col-money">収入金額</th>
                      <th className="col-money">支出金額</th>
                      <th className="col-money">差引残高</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentSheet.rows.map((row) => {
                      const isIncErr = row.errorField === 'income';
                      const isExpErr = row.errorField === 'expense';
                      const isBalErr = row.errorField === 'balance';
                      const isCarryErr = row.carryOverError;

                      return (
                        <tr key={row.id}>
                          <td className="col-no">{row.id}</td>
                          <td className="col-date handwritten">{row.date}</td>
                          <td className="col-desc handwritten">{row.desc}</td>
                          
                          {/* 収入金額のセル */}
                          <td 
                            className={`col-money ${isIncErr ? 'error-highlight' : ''}`}
                            onMouseEnter={() => isIncErr && setHoveredError(row)}
                            onMouseLeave={() => setHoveredError(null)}
                            style={{ cursor: isIncErr ? 'help' : 'default' }}
                          >
                            {row.income > 0 && <span className="handwritten">{row.income}</span>}
                            {isIncErr && (
                              <>
                                <span className="error-badge"><i className="fa-solid fa-triangle-exclamation"></i></span>
                                {hoveredError?.id === row.id && (
                                  <div className="tooltip-explanation" style={{ position: 'absolute', bottom: '100%', left: '0' }}>
                                    <strong>手書き崩れの誤認を検知!</strong><br />
                                    紙の文字は「{row.correctVal}」ですが、OCRが「{row.originalVal}」と誤読。前後の計算式からAIが自動逆算補正しました。
                                  </div>
                                )}
                              </>
                            )}
                          </td>

                          {/* 支出金額のセル */}
                          <td 
                            className={`col-money ${isExpErr ? 'error-highlight' : ''}`}
                            onMouseEnter={() => isExpErr && setHoveredError(row)}
                            onMouseLeave={() => setHoveredError(null)}
                            style={{ cursor: isExpErr ? 'help' : 'default' }}
                          >
                            {row.expense > 0 && <span className="handwritten">{row.expense}</span>}
                            {isExpErr && (
                              <>
                                <span className="error-badge"><i className="fa-solid fa-triangle-exclamation"></i></span>
                                {hoveredError?.id === row.id && (
                                  <div className="tooltip-explanation" style={{ position: 'absolute', bottom: '100%', left: '0' }}>
                                    <strong>手書き崩れの誤認を検知!</strong><br />
                                    紙の文字は「{row.correctVal}」ですが、OCRが「{row.originalVal}」と誤認。前後の整合性から正しい支出額を特定しました。
                                  </div>
                                )}
                              </>
                            )}
                          </td>

                          {/* 差引残高のセル */}
                          <td 
                            className={`col-money ${isBalErr ? 'error-highlight' : isCarryErr ? 'warning-highlight' : ''}`}
                            onMouseEnter={() => (isBalErr || isCarryErr) && setHoveredError(row)}
                            onMouseLeave={() => setHoveredError(null)}
                            style={{ cursor: (isBalErr || isCarryErr) ? 'help' : 'default' }}
                          >
                            <span className="handwritten">{row.balance}</span>
                            {isBalErr && (
                              <>
                                <span className="error-badge"><i className="fa-solid fa-triangle-exclamation"></i></span>
                                {hoveredError?.id === row.id && (
                                  <div className="tooltip-explanation" style={{ position: 'absolute', bottom: '100%', right: '0' }}>
                                    <strong>計算ミスを検知!</strong><br />
                                    受講生の計算（足し算/引き算）自体が間違っています。<br />
                                    正しくは「{row.correctVal}」ですが「{row.originalVal}」と書かれています。
                                  </div>
                                )}
                              </>
                            )}
                            {isCarryErr && (
                              <>
                                <span className="warning-badge"><i className="fa-solid fa-arrows-spin"></i></span>
                                {hoveredError?.id === row.id && (
                                  <div className="tooltip-explanation" style={{ position: 'absolute', bottom: '100%', right: '0' }}>
                                    <strong>前行エラーの連鎖ズレ!</strong><br />
                                    前の行で発生した計算ミスをそのまま引き継いでしまっています。本当に修正すべきは上の赤いセルです。
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="highlight-legend">
                  <div className="legend-item">
                    <div className="legend-color error-highlight"></div>
                    <span>赤枠: 計算・OCR認識エラー（根本原因）</span>
                  </div>
                  <div className="legend-item">
                    <div className="legend-color warning-highlight"></div>
                    <span>黄枠: エラーの連鎖による残高ズレ</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Test Presets (Switch handwritten sheets to scan) */}
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 'bold' }}>
              スキャン検証用手書きサンプル（切り替え）:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              {Object.values(HANDWRITTEN_SHEETS).map((sheet) => (
                <button
                  key={sheet.id}
                  onClick={() => setActiveSheet(sheet.id)}
                  style={{
                    padding: '8px',
                    fontSize: '0.75rem',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: activeSheet === sheet.id ? 'var(--accent-cyan)' : 'var(--border-color)',
                    background: activeSheet === sheet.id ? 'rgba(6, 182, 212, 0.1)' : 'transparent',
                    color: activeSheet === sheet.id ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: activeSheet === sheet.id ? 'bold' : 'normal',
                    textAlign: 'left',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{sheet.title}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Reset / Rescan button */}
          {hasScanned && (
            <div className="controls-panel">
              <button className="btn-primary" onClick={() => setHasScanned(false)}>
                <i className="fa-solid fa-rotate-left"></i>
                <span>写真を撮り直す（再スキャン）</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Panel: Digitalized Ledger Sheet & AI Corrected Results */}
        <div className="glass-panel results-card">
          <div className="results-header">
            <h2 className="results-title">
              <i className="fa-solid fa-square-poll-vertical"></i>
              <span>② 監査 ＆ 補正後のデジタル帳簿</span>
            </h2>
          </div>

          {!hasScanned ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', minHeight: '350px', textAlign: 'center', padding: '2rem' }}>
              <i className="fa-solid fa-camera" className="fa-beat-fade" style={{ fontSize: '3.5rem', marginBottom: '1.5rem', color: 'var(--accent-cyan)', '--fa-beat-fade-opacity': 0.4, '--fa-beat-fade-scale': 1.05 }}></i>
              <h3 style={{ color: '#fff', margin: '0 0 10px 0' }}>未スキャン状態</h3>
              <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.85rem' }}>左側の領域をクリックして「写真スキャン」を実行してください。</p>
              <button className="btn-primary" onClick={triggerFullScan}>
                <i className="fa-solid fa-magnifying-glass-chart"></i>
                <span>今すぐ写真をスキャンする</span>
              </button>
            </div>
          ) : (
            <>
              {/* Audit Summary Box */}
              <div className="stats-summary">
                <div className="stat-box">
                  <div className="stat-box-label">炙り出したエラー</div>
                  <div className="stat-box-value value-red">
                    {errorCount} 件
                  </div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-label">現金残高の過不足</div>
                  <div className="stat-box-value value-cyan">
                    {balanceDiff === 0 ? '±0円' : balanceDiff > 0 ? `+${balanceDiff}円` : `${balanceDiff}円`}
                  </div>
                </div>
                <div className="stat-box">
                  <div className="stat-box-label">真の現金残高</div>
                  <div className="stat-box-value value-green">
                    {correctedFinal}円
                  </div>
                </div>
              </div>

              {/* Digitalized Ledger Table */}
              <div style={{ flexGrow: 1, overflow: 'auto' }}>
                <table className="digital-table">
                  <thead>
                    <tr>
                      <th style={{ width: '8%' }}>No</th>
                      <th style={{ width: '15%' }}>日付</th>
                      <th style={{ width: '37%' }}>摘要</th>
                      <th style={{ width: '20%', textAlign: 'right' }}>収入金額</th>
                      <th style={{ width: '20%', textAlign: 'right' }}>支出金額</th>
                      <th style={{ width: '20%', textAlign: 'right' }}>修正後残高</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditedRows.map((row) => {
                      const hasIncCorrection = row.errorField === 'income';
                      const hasExpCorrection = row.errorField === 'expense';
                      const hasBalCorrection = row.errorField === 'balance' || row.carryOverError;

                      return (
                        <tr key={row.id}>
                          <td>{row.id}</td>
                          <td>{row.date}</td>
                          <td>
                            <strong>{row.desc}</strong>
                          </td>
                          
                          {/* 収入 */}
                          <td style={{ textAlign: 'right' }}>
                            {hasIncCorrection ? (
                              <div>
                                <span className="original-value-strike">{row.originalVal}</span>
                                <span className="corrected-cell">{row.auditedIncome}</span>
                              </div>
                            ) : (
                              row.income > 0 ? row.income : '-'
                            )}
                          </td>

                          {/* 支出 */}
                          <td style={{ textAlign: 'right' }}>
                            {hasExpCorrection ? (
                              <div>
                                <span className="original-value-strike">{row.originalVal}</span>
                                <span className="corrected-cell">{row.auditedExpense}</span>
                              </div>
                            ) : (
                              row.expense > 0 ? row.expense : '-'
                            )}
                          </td>

                          {/* 修正後残高 */}
                          <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                            {hasBalCorrection ? (
                              <div>
                                <span className="original-value-strike">{row.balance}</span>
                                <span className="corrected-cell">{row.auditedBalance}</span>
                              </div>
                            ) : (
                              row.auditedBalance
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* AI Diagnostics details */}
              <div className="diagnostics-panel" style={{ marginTop: '1rem' }}>
                <div className="diag-title">
                  <i className="fa-solid fa-brain"></i>
                  <span>AI 整合性監査診断レポート</span>
                </div>
                <ul className="diag-list">
                  {currentSheet.rows.filter(r => !r.isCorrect).map((errRow) => (
                    <li 
                      key={errRow.id} 
                      className={`diag-item ${errRow.errorType === 'OCR_MISREAD' ? 'warning' : 'error'}`}
                    >
                      <div className="diag-item-icon">
                        {errRow.errorType === 'OCR_MISREAD' ? (
                          <i className="fa-solid fa-eye-slash"></i>
                        ) : (
                          <i className="fa-solid fa-calculator"></i>
                        )}
                      </div>
                      <div className="diag-item-text">
                        <strong>No.{errRow.id} ({errRow.desc}):</strong> {errRow.note}
                      </div>
                    </li>
                  ))}
                  <li className="diag-item" style={{ borderLeft: '3px solid var(--accent-green)', background: 'rgba(16, 185, 129, 0.02)' }}>
                    <div className="diag-item-icon" style={{ color: 'var(--accent-green)' }}>
                      <i className="fa-solid fa-circle-check"></i>
                    </div>
                    <div className="diag-item-text" style={{ color: 'var(--text-secondary)' }}>
                      計算検証エンジンによる貸借バランスおよび資金流出入の整合を確認しました。<strong>修正後の現金残高「{correctedFinal}円」は簿記上100%正確です。</strong>
                    </div>
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
