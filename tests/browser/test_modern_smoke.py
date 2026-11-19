"""Real-browser smoke checks for the statically served Modern application.

Run from the repository root after installing the Playwright Python package and
its Chromium browser: python -m unittest discover -s tests/browser -v

Every test receives an isolated browser context (including IndexedDB). A local
HTTP server is started inside the test process; no external host is required.
On failure, browser traces, screenshots and console diagnostics are saved under
browser-artifacts/ for the CI artifact uploader.
"""

from __future__ import annotations

import http.server
import json
import os
import re
from pathlib import Path
import threading
import unittest

from playwright.sync_api import expect, sync_playwright


ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / 'browser-artifacts'


class QuietStaticHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format, *args):  # noqa: A002
        pass


class ModernBrowserSmoke(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), QuietStaticHandler)
        cls.server_thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        cls.base_url = f'http://127.0.0.1:{cls.server.server_port}/CurvatureModern.html'
        cls.playwright = sync_playwright().start()
        launch = {'headless': True}
        if os.environ.get('CURVATURE_CHROMIUM_EXECUTABLE'):
            launch['executable_path'] = os.environ['CURVATURE_CHROMIUM_EXECUTABLE']
        cls.browser = cls.playwright.chromium.launch(**launch)

    @classmethod
    def tearDownClass(cls):
        try:
            cls.browser.close()
            cls.playwright.stop()
        finally:
            cls.server.shutdown()
            cls.server.server_close()
            cls.server_thread.join(timeout=5)

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 1440, 'height': 900})
        self.context.tracing.start(screenshots=True, snapshots=True, sources=True)
        self.page = self.context.new_page()
        self.page.set_default_timeout(15000)
        self.console = []
        self.page.on('pageerror', lambda exc: self.console.append('PAGE ERROR: ' + str(exc)))
        self.page.on('console', lambda msg: self.console.append(f'console.{msg.type}: {msg.text}'))
        self.page.on('requestfailed', lambda req: self.console.append('REQUEST FAILED: ' + req.url))
        self.page.on('response', lambda response: self.console.append(
            f'HTTP {response.status}: {response.url}') if response.status >= 400 else None)

    def _failed(self):
        # unittest's _Outcome has no `success` property in Python 3.13.
        # Inspect the result's accumulated (test, traceback) pairs instead.
        result = getattr(getattr(self, '_outcome', None), 'result', None)
        if result is None:
            return False
        return any(test is self for test, _ in result.failures + result.errors)

    def _save_diagnostics(self):
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        name = self.id().rsplit('.', 1)[-1]
        (ARTIFACTS / f'{name}.log').write_text('\n'.join(self.console), encoding='utf-8')
        try:
            self.page.screenshot(path=str(ARTIFACTS / f'{name}.png'), full_page=True, timeout=5000)
        except Exception as exc:
            (ARTIFACTS / f'{name}-screenshot-error.txt').write_text(str(exc), encoding='utf-8')
        try:
            (ARTIFACTS / f'{name}.html').write_text(self.page.content(), encoding='utf-8')
        except Exception as exc:
            (ARTIFACTS / f'{name}-dom-error.txt').write_text(str(exc), encoding='utf-8')
        try:
            state = self.page.evaluate('''() => ({
                url: location.href,
                readyState: document.readyState,
                appLoaded: !!window.CurvatureModernApp,
                studioUiLoaded: !!window.CurvatureModernAnimationStudioUI,
                studioApiLoaded: !!window.CurvatureModernAnimationStudio,
                workspaceMode: window.CurvatureModernApp?.getWorkspaceMode?.() ?? null,
                animationTabPressed: document.querySelector('#ModernAnimationTab')?.getAttribute('aria-pressed'),
                animationWorkspaceHidden: document.querySelector('#ModernAnimationWorkspace')?.hidden ?? null,
                libraryHtml: document.querySelector('#ModernAnimationLibrary')?.innerHTML ?? null,
                scripts: [...document.scripts].map(s => s.src),
            })''')
            (ARTIFACTS / f'{name}-state.json').write_text(
                json.dumps(state, indent=2, ensure_ascii=False), encoding='utf-8')
        except Exception as exc:
            (ARTIFACTS / f'{name}-state-error.txt').write_text(str(exc), encoding='utf-8')

    def tearDown(self):
        failed = self._failed()
        try:
            if failed:
                self._save_diagnostics()
        finally:
            try:
                if failed:
                    ARTIFACTS.mkdir(parents=True, exist_ok=True)
                    name = self.id().rsplit('.', 1)[-1]
                    self.context.tracing.stop(path=str(ARTIFACTS / f'{name}-trace.zip'))
                else:
                    self.context.tracing.stop()
            finally:
                self.context.close()

    def open_modern(self):
        response = self.page.goto(self.base_url, wait_until='load', timeout=30000)
        self.assertEqual(response.status, 200)
        expect(self.page.locator('#ModernSceneTab')).to_be_visible()
        expect(self.page.locator('#ModernAnimationTab')).to_be_visible()

    def open_animation(self):
        self.page.locator('#ModernAnimationTab').click()
        expect(self.page.locator('#ModernAnimationWorkspace')).to_be_visible()
        # Library buttons set aria-label to their *description*, not their
        # visible caption. get_by_role(name='New project') cannot match one.
        # Match the visible text and wait for the asynchronous library render.
        expect(self.page.locator('#ModernAnimationLibrary').get_by_text('New project', exact=True)).to_be_visible(timeout=15000)

    def assert_shipped_demo_catalog(self):
        result = self.page.evaluate("""() => {
            const demos = window.CurvatureModernDemoCatalog.load();
            const soundly = demos.find(demo => demo.id === 'soundly');
            return {
                ids: demos.map(demo => demo.id),
                frames: soundly.project.keyframes.length,
                duration: window.CurvatureModernAnimationProject.totalMs(soundly.project),
                frozen: Object.isFrozen(demos) && Object.isFrozen(soundly.project.keyframes[0].value),
                display: soundly.project.baseExperiment.display.mode,
            };
        }""")
        self.assertEqual(result, {'ids': ['soundly'], 'frames': 9,
                                  'duration': 59100, 'frozen': True, 'display': 'compare'})

    def test_offline_presentation_compositor_pixels(self):
        # Deliberately no navigation or live app: the compositor is a standalone
        # consumer of exact-size physical pixels and decoded observation assets.
        self.page.set_content('<!doctype html><html><body></body></html>')
        for script in [
            'src/ui/modern/ModernExperimentState.js',
            'src/ui/modern/ModernExperimentFingerprint.js',
            'src/ui/modern/ModernCameraHud.js',
            'src/geometry/CurvatureSurfaceGeometry.js',
            'src/app/CurvaturePhysicalCamera.js',
            'src/camera/ModernCameraTelemetry.js',
            'src/camera/ModernCameraInterpolator.js',
            'src/animation/ModernAnimationCompatibility.js',
            'src/animation/ModernAnimationContract.js',
            'src/animation/ModernAnimationProject.js',
            'src/animation/ModernAnimationPresentation.js',
            'src/animation/ModernReferenceImage.js',
            'src/animation/ModernAnimationPresentationCompositor.js',
        ]:
            self.page.add_script_tag(content=(ROOT / script).read_text(encoding='utf-8'))
        project = json.loads((ROOT / 'demos/modern/soundly.json').read_text(encoding='utf-8'))['animations'][0]['project']
        result = self.page.evaluate("""async project => {
            const api = CurvatureModernAnimationPresentationCompositor;
            project.baseExperiment.display.mode = 'compare';
            project.contract.referenceExperiment.display.mode = 'compare';
            project.keyframes[0].referenceImageIds = ['photo'];
            project.keyframes[0].description = 'An observation';
            const raw = new OffscreenCanvas(300, 400), ctx = raw.getContext('2d');
            ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, 300, 400);
            ctx.fillStyle = '#ff00ff'; ctx.fillRect(0, 0, 300, 100);
            const blob = await raw.convertToBlob(), image = await createImageBitmap(blob);
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader(); reader.onload = () => resolve(reader.result);
                reader.onerror = reject; reader.readAsDataURL(blob);
            });
            const photo = api.observation({version:1,id:'photo',title:'Synthetic test raster',
                original:{dataUrl,width:300,height:400}}, image);
            const results = [];
            for (const cameraHud of [false,true]) for (const referenceLayout of ['side', 'below', 'hidden', 'auto', 'stacked', 'wide']) {
                const plan = api.plan(project, {width:1280,referenceLayout,layoutMode:'fixed',referenceDimensions:[{id:'photo',width:300,height:400}],cameraHud,cameraHudAppearance:{size:125,position:'top-left',opacity:90}});
                for (const time of [0, plan.times[1].arrivalMs]) {
                    const f = api.frameAt(plan,time), views = {};
                    for (const side of f.sides) {
                        const canvas = new OffscreenCanvas(f.viewSize.width,f.viewSize.height), c=canvas.getContext('2d');
                        c.fillStyle = side==='A'?'#ff0000':'#0000ff'; c.fillRect(0,0,canvas.width,canvas.height);
                        views[side]={canvas,quality:'accurate',timeMs:time,cameraModel:{showModel:f.expected[side].showModel,Height:8,CameraEast:-45,CameraNorth:496,Pan:0.5,Nick:side==='A'?0:0.1,Roll:0,camViewAngle:0.1,deviceRatio:16/9,viewcenterHorizon:3,rEarth:6371000,rFEarth:10000000}};
                    }
                    const out=new OffscreenCanvas(f.width,f.height), painted=api.paint(out,f,views,f.referenceId?photo:null);
                    const pixel=(x,y)=>Array.from(out.getContext('2d').getImageData(Math.floor(x),Math.floor(y),1,1).data);
                    for (const side of f.sides) {
                        const v=f.panels[side].viewport;
                        results.push({kind:side,pixel:pixel(v.x+v.width/2,v.y+v.height/2)});
                        if(cameraHud){
                            const data=out.getContext('2d').getImageData(v.x,v.y,v.width,v.height).data;
                            for(let j=0;j<data.length;j+=4){if(data[j]!== (side==='A'?255:0)||data[j+1]!==0||data[j+2]!== (side==='B'?255:0)||data[j+3]!==255)throw Error('Metadata covered a physical pixel');}
                        }
                    }
                    if(cameraHud){const h=f.cameraHud;results.push({kind:'hud',pixel:pixel(h.x+1,h.y+1)});}
                    if(f.referenceId){const r=api.contain(f.photoBox,300,400);
                        results.push({kind:'photo top',pixel:pixel(r.x+r.width/2,r.y+r.height/8)});
                        results.push({kind:'photo bottom',pixel:pixel(r.x+r.width/2,r.y+r.height*.75)});
                    }else if(f.photoBox){const r=f.photoBox;
                        results.push({kind:'blank',pixel:pixel(r.x+r.width/2,r.y+r.height/2)});
                    }
                    if(painted.warnings.length)throw Error(referenceLayout+' '+f.topology+' HUD='+cameraHud+' '+JSON.stringify(f.sceneCaption)+' '+painted.warnings.join(','));
                }
            }
            image.close(); return results;
        }""", project)
        colors = {'A': [255, 0, 0, 255], 'B': [0, 0, 255, 255],
                  'photo top': [255, 0, 255, 255], 'photo bottom': [0, 255, 0, 255],
                  'blank': [255, 255, 255, 255], 'hud': [232, 239, 245, 255]}
        self.assertEqual(len(result), 90)
        for item in result:
            self.assertEqual(item['pixel'], colors[item['kind']], item)

    def test_animation_worker_projection_pixels_after_resize(self):
        # Exercise the real Worker graph, optical painter and encoded pixels.
        # Use a simple vacuum scene to isolate projection from refraction.
        self.page.set_content('<!doctype html><html><body></body></html>')
        modules = {'ModernExperimentState.js', 'ModernExperimentFingerprint.js',
                   'ModernCameraHud.js', 'ModernCameraInterpolator.js', 'ModernCameraTelemetry.js',
                   'ModernCameraSequence.js', 'ModernSemanticNaming.js', 'ModernExperimentThumbnail.js',
                   'ModernAnimationCompatibility.js', 'ModernAnimationContract.js', 'ModernAnimationProject.js',
                   'ModernAnimationAtmosphereVariant.js', 'ModernReferenceImage.js', 'ModernReferenceImageLibrary.js',
                   'ModernAnimationSequences.js', 'ModernAnimationStudio.js', 'ModernAnimationLibrary.js',
                   'ModernDemoCatalogData.js', 'ModernDemoCatalog.js'}
        html = (ROOT / 'CurvatureModern.html').read_text(encoding='utf-8')
        for src in re.findall(r'<script src="([^"?]+)(?:\?[^"\n]*)?"', html):
            if Path(src).name in modules:
                self.page.add_script_tag(content=(ROOT / src).read_text(encoding='utf-8'))
                modules.remove(Path(src).name)
        self.assertEqual(modules, set())
        path = ROOT / 'src/animation/ModernAnimationFrameWorker.js'
        source = path.read_text(encoding='utf-8')
        block = re.search(r'importScripts\((.*?)\);', source, re.S)
        dependencies = [(path.parent / item.split('?')[0]).resolve().read_text(encoding='utf-8')
                        for item in re.findall(r"'([^']+)'", block.group(1))]
        result = self.page.evaluate(r"""async spec => {
            const project=CurvatureModernDemoCatalog.load().find(d=>d.id==='soundly').project;
            const urls=[];
            function blobUrl(text){const url=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));urls.push(url);return url;}
            const source=spec.source.replace(/importScripts\([\s\S]*?\);/,
                'importScripts('+spec.dependencies.map(blobUrl).map(JSON.stringify).join(',')+');');
            const probe=`self.onmessage=async ({data:project})=>{try{
                const session=setup({project,width:1280,height:720,fps:25,previewTimeMs:28200,
                    presentation:{referenceLayout:'hidden'}});
                const sample=JSON.parse(JSON.stringify(CurvatureModernAnimationProject.sampleAt(project,28200)));
                sample.display.horizon=true;sample.display.eyeLevel=true;
                sample.scene.camera.Roll=0;sample.scene.camera.Nick=0;
                sample.scene.camera.viewcenterHorizon=3;
                sample.scene.atmosphere='vacuum';
                sample.compare.A.surface='globe';sample.compare.A.atmosphere='vacuum';
                sample.compare.B.surface='globe';sample.compare.B.atmosphere='vacuum';
                // Reduce the object count only in this projection test.
                sample.scene.objects.NObjects=[1,0];sample.scene.showGrid=false;
                const rows=[];
                for(const mode of ['compare','scene']){
                    sample.display.mode=mode;
                    sample.scene.surface.showModel=1;
                    for(const [width,height] of [[416,234],[960,540],[640,360]]){
                        for(const side of mode==='compare'?['A','B']:['A']){
                            const frame=session.render(sample,side,{width,height});
                            const camera=frame.metrics.projectionCamera,model=frame.cameraModel;
                            const p=CurvatureRayHorizon.diagnose({geometry:'globe',radius:model.rEarth,
                                observerHeight:model.Height,atmosphere:'vacuum'});
                            if(p.status!=='resolved')throw Error('Expected resolved vacuum horizon');
                            const pan=model.Pan*Math.PI/180,angle=p.angleDegrees*Math.PI/180;
                            const forward=[Math.sin(pan)*Math.cos(angle),Math.cos(pan)*Math.cos(angle),Math.sin(angle)];
                            const nearPoint=forward.map(v=>v*1000),farPoint=forward.map(v=>v*2000);
                            const reference=CurvaturePerspectivePreview.project({primitives:[{type:'line',points:[nearPoint,farPoint]}]},camera,width,height);
                            const segment=reference.segments[0];
                            if(!segment)throw Error('Reference outside viewport');
                            const y=segment.points?segment.points[0][1]:segment.a[1];
                            const image=await createImageBitmap(await frame.canvas.convertToBlob());
                            const decoded=new OffscreenCanvas(width,height),ctx=decoded.getContext('2d');
                            ctx.drawImage(image,0,0);image.close();
                            const pixels=ctx.getImageData(0,0,width,height).data;
                            let best={count:0,y:-1};
                            for(let row=0;row<height;row++){
                                let count=0;
                                for(let x=40;x<width-10;x++){
                                    const i=(row*width+x)*4;
                                    if(pixels[i]>150&&pixels[i+1]>50&&pixels[i+1]<180&&pixels[i+2]<90)count++;
                                }
                                if(count>best.count)best={count,y:row};
                            }
                            rows.push({mode,side,width,height,y,painted:best.y,count:best.count,
                                center:camera.pixelTransform.offsetX,scale:camera.pixelTransform.scaleY});
                        }
                    }
                }
                self.postMessage({rows});
            }catch(e){self.postMessage({error:String(e.stack||e)});}};`;
            const worker=new Worker(blobUrl(source+probe));
            try{return await new Promise((resolve,reject)=>{
                worker.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data.rows);
                worker.onerror=e=>reject(Error(e.message));worker.postMessage(project);
            });}finally{worker.terminate();urls.forEach(u=>URL.revokeObjectURL(u));}
        }""", {"source": source, "dependencies": dependencies})
        self.assertEqual(len(result), 9)
        for row in result:
            self.assertAlmostEqual(row['center'], row['width']/2, delta=1, msg=str(row))
            self.assertGreater(row['count'], row['width']*0.15, row)
            self.assertAlmostEqual(row['painted'], row['y'], delta=2, msg=str(row))

    def test_presentation_video_workers_with_original(self):
        # Real WebCodecs requires a secure origin (localhost qualifies).
        try:
            self.page.goto(self.base_url.replace('CurvatureModern.html', 'tests/'))
        except Exception as error:
            if 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(error):
                self.skipTest('Browser policy blocks localhost; WebCodecs needs a secure context')
            raise
        self._presentation_workers_with_original(live_video=True)

    def test_presentation_png_workers_with_original(self):
        self._presentation_workers_with_original(live_video=False)

    def test_canvas_direct_presentation_workers(self):
        self._presentation_workers_with_original(live_video=False, render_method="canvas-direct")

    def _presentation_workers_with_original(self, live_video, render_method="accurate"):
        # Production controller, Studio save/reopen and both real worker sources.
        # Blob URLs substitute only script transport, not the initialization or
        # rendering protocol; a separate full-page test covers the HTTP wiring.
        self.page.set_content('<!doctype html><html><body></body></html>')
        modules = {'ModernExperimentState.js', 'ModernExperimentFingerprint.js',
                   'ModernCameraHud.js', 'ModernCameraInterpolator.js', 'ModernCameraTelemetry.js',
                   'ModernCameraSequence.js', 'ModernSemanticNaming.js', 'ModernExperimentThumbnail.js',
                   'ModernAnimationCompatibility.js', 'ModernAnimationContract.js', 'ModernAnimationProject.js',
                   'ModernAnimationAtmosphereVariant.js', 'ModernReferenceImage.js', 'ModernReferenceImageLibrary.js',
                   'ModernAnimationSequences.js', 'ModernAnimationStudio.js', 'ModernAnimationLibrary.js',
                   'ModernDemoCatalogData.js', 'ModernDemoCatalog.js', 'ModernAnimationPresentation.js',
                   'ModernTargetIndicator.js', 'ModernAnimationCanvasHud.js', 'ModernAnimationPresentationCompositor.js',
                   'ModernAnimationFrameExport.js', 'ModernAnimationBackgroundExport.js',
                   'ModernAnimationVideoPipeline.js', 'ModernAnimationBackgroundVideoExport.js'}
        html = (ROOT / 'CurvatureModern.html').read_text(encoding='utf-8')
        for src in re.findall(r'<script src="([^"?]+)(?:\?[^"\n]*)?"', html):
            if Path(src).name in modules:
                self.page.add_script_tag(content=(ROOT / src).read_text(encoding='utf-8'))
                modules.remove(Path(src).name)
        self.assertEqual(modules, set())
        scripts = {}
        for name in ['ModernAnimationFrameWorker.js', 'ModernAnimationArchiveWorker.js', 'ModernAnimationVideoEncoderWorker.js']:
            path = ROOT / 'src/animation' / name
            source = path.read_text(encoding='utf-8')
            block = re.search(r'importScripts\((.*?)\);', source, re.S)
            dependencies = [(path.parent / item.split('?')[0]).resolve().read_text(encoding='utf-8')
                            for item in re.findall(r"'([^']+)'", block.group(1))]
            scripts[name] = {'source': source, 'dependencies': dependencies}
        result = self.page.evaluate(r"""async ({scripts,liveVideo,renderMethod}) => {
            const projects=CurvatureModernAnimationProject,studio=CurvatureModernAnimationStudio,
                library=CurvatureModernAnimationLibrary;
            const demo=CurvatureModernDemoCatalog.load().find(d=>d.id==='soundly');
            const copy=projects.validate({...demo.project,id:'soundly_copy',name:demo.project.name+' (copy)'});
            let draft=studio.fromProject(copy),key=draft.frames[4].key;
            draft=studio.editFrame(draft,key,'referenceImageIds',['photo']);
            draft=studio.editFrame(draft,key,'narrativeTitle','Real observation');
            draft=studio.editFrame(draft,key,'description','Observation');
            const saved=library.record(studio.buildSaved(draft,copy.id),'canvas-direct',copy.id,1,1);
            const reopened=library.normalize(JSON.parse(JSON.stringify(saved))).project;
            const playable=studio.build(studio.fromProject(reopened),copy.id);
            const raw=new OffscreenCanvas(3,4),c=raw.getContext('2d');
            c.fillStyle='#00ff00';c.fillRect(0,0,3,4);
            c.fillStyle='#ff00ff';c.fillRect(0,0,3,1);
            const blob=await raw.convertToBlob(),dataUrl=await new Promise(resolve=>{
                const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);
            });
            const original={version:1,id:'photo',title:'Synthetic portrait',author:'Observer',license:'CC BY',original:{dataUrl,width:3,height:4}};
            const urls=[],workers=[];
            function url(source){const value=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));urls.push(value);return value;}
            function WorkerCtor(path,probe=''){const name=path.split('?')[0].split('/').at(-1),spec=scripts[name],deps=spec.dependencies.map(url);
                const source=spec.source.replace(/importScripts\([\s\S]*?\);/,'importScripts('+deps.map(JSON.stringify).join(',')+');');
                const worker=new Worker(url(source+probe));workers.push(worker);return worker;
            }
            try{
                const controller=CurvatureModernAnimationBackgroundExport.create({WorkerCtor});
                const results=[];
                for(const project of [reopened,playable]){
                    const previewTimeMs=projects.timeline(project)[4].arrivalMs;
                    let limit;
                    try{await controller.start({project,width:1280,height:720,fps:25,workerCount:1,renderMethod,
                        presentation:{referenceLayout:'side'},referenceImages:[original]});}catch(e){limit=e.message;}
                    if(!limit?.includes('1479 requested; maximum 751'))throw Error('Unexpected sequence limit: '+limit);
                    const done=await controller.start({project,width:1280,height:720,fps:25,workerCount:1,renderMethod,
                        presentation:{referenceLayout:'auto',layoutMode:'fixed'},referenceImages:[original],previewTimeMs,cameraHud:true});
                    if(done.manifest.presentation.cameraHudPlacement!=='external'||done.manifest.frames[0].warnings.some(w=>w.startsWith('camera')))throw Error('Presentation HUD: '+JSON.stringify(done.manifest.frames[0].warnings));
                    const image=await createImageBitmap(done.previewBlob),canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');
                    ctx.drawImage(image,0,0);
                    const pixels=ctx.getImageData(0,0,image.width,image.height).data;
                    let green=0,magenta=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i]===0&&pixels[i+1]===255&&pixels[i+2]===0)green++;if(pixels[i]===255&&pixels[i+1]===0&&pixels[i+2]===255)magenta++;}
                    results.push({width:image.width,height:image.height,green,magenta,version:done.manifest.project.version,
                        time:done.manifest.frames[0].timeMs,sides:done.manifest.sides,reference:done.manifest.frames[0].referenceId,
                        author:done.manifest.presentation.referenceImages[0].author,title:done.manifest.project.keyframes[4].narrativeTitle,
                        optical:Object.keys(done.manifest.frames[0].renderStats),zip:done.blob.type});image.close();
                }
                // Short sequence from the actual edited project, with a real
                // photograph at arrival. Use the disk-writer protocol against an
                // instrumented sink (no native file-picker permissions in CI).
                const frames=playable.keyframes.slice(4,6).map((f,i)=>({...f,travelMs:i?400:0,holdMs:0,
                    referenceImageIds:[i?'landscape':'photo']}));
                const wide=new OffscreenCanvas(4,3),wc=wide.getContext('2d');wc.fillStyle='#00ffff';wc.fillRect(0,0,4,3);
                const wideBlob=await wide.convertToBlob(),wideUrl=await new Promise(resolve=>{
                    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(wideBlob);
                });
                const landscape={version:1,id:'landscape',title:'Landscape.jpg',original:{dataUrl:wideUrl,width:4,height:3}};
                const short=projects.validate({...playable,keyframes:frames});
                const chunks=[],sink={closed:false,aborted:false,async write(part){chunks.push(part.slice());},
                    async close(){this.closed=true;},async abort(){this.aborted=true;}};
                const settings={project:short,width:1280,height:720,fps:5,workerCount:2,renderMethod,
                    presentation:{referenceLayout:'auto',layoutMode:'fixed'},referenceImages:[original,landscape],cameraHud:true};
                const stream=await controller.start({...settings,sink});
                const preview=await controller.start({...settings,previewTimeMs:200});
                const previewData=await new Promise(resolve=>{
                    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(preview.previewBlob);
                });
                const zip=new Blob(chunks,{type:'application/zip'}),data=await new Promise(resolve=>{
                    const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(zip);
                });
                const videoSettings={...settings,fps:10,format:'webm'};
                // Exercise the actual video renderer and compositor even where WebCodecs
                // is unavailable: capture the Canvas passed to the VideoFrame constructor.
                const probe=`self.onmessage=async ({data})=>{try{
                    const p=setup(data,true),frames=[];
                    for(const index of [0,2,3]){const frame=await CurvatureModernAnimationVideoPipeline.renderTimestamp(p.plan,index,p.render,class {constructor(canvas){this.canvas=canvas;}close(){}},null,p.compose,p.presentationAdapter);
                        frames.push({blob:await frame.frames.PRESENTATION.canvas.convertToBlob(),time:frame.sampleTimeMs});}
                    self.postMessage({frames});
                }catch(e){self.postMessage({error:String(e.stack||e)});}};`;
                const renderer=WorkerCtor('ModernAnimationFrameWorker.js',probe);
                const captured=await new Promise((resolve,reject)=>{renderer.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data);renderer.onerror=e=>reject(Error(e.message));renderer.postMessage(videoSettings);});
                const capturedData=await Promise.all(captured.frames.map(async frame=>({time:frame.time,data:await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(frame.blob);})})));
                if(capturedData[1].time!==200||capturedData[1].data!==previewData)throw Error('Video Canvas and PNG preview differ');
                let encodedVideo=null;
                if(liveVideo){
                const video=await CurvatureModernAnimationBackgroundVideoExport.create({WorkerCtor}).start(videoSettings);
                function colors(source,width,height){
                    const decoded=new OffscreenCanvas(width,height),dc=decoded.getContext('2d');
                    dc.drawImage(source,0,0);
                    const px=dc.getImageData(0,0,width,height).data;
                    let green=0,cyan=0;for(let i=0;i<px.length;i+=4){
                        if(px[i]<50&&px[i+1]>180&&px[i+2]<50)green++;
                        if(px[i]<50&&px[i+1]>180&&px[i+2]>180)cyan++;
                    }return {green,cyan};
                }
                const sourceColors=[];
                for(const i of [0,2]){
                    const image=await createImageBitmap(captured.frames[i].blob);
                    try{sourceColors.push(colors(image,image.width,image.height));}finally{image.close();}
                }
                const clip=document.createElement('video'),clipUrl=URL.createObjectURL(video.blob);urls.push(clipUrl);
                clip.muted=true;clip.preload='auto';clip.playsInline=true;
                document.body.appendChild(clip);
                // loadeddata is not a presentation fence. Explicitly seek to
                // the middle of each intended coded interval and wait for
                // seek completion and current-frame availability.
                function event(name,action){
                    return new Promise((resolve,reject)=>{
                        let timeout;
                        function cleanup(){clearTimeout(timeout);clip.removeEventListener(name,done);clip.removeEventListener('error',failed);}
                        function done(){cleanup();resolve();}
                        function failed(){cleanup();reject(Error('Video '+name+' failed: '+(clip.error?.message||'decode error')));}
                        clip.addEventListener(name,done);clip.addEventListener('error',failed);
                        timeout=setTimeout(()=>{cleanup();reject(Error('Timed out waiting for video '+name));},10000);
                        action();
                    });
                }
                try{
                    await event('loadeddata',()=>{clip.src=clipUrl;});
                    async function sample(time){
                        await event('seeked',()=>{clip.currentTime=time;});
                        if(clip.seeking||clip.readyState<HTMLMediaElement.HAVE_CURRENT_DATA||Math.abs(clip.currentTime-time)>.001)
                            throw Error('Decoded frame is not ready at '+time+' s');
                        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                        return colors(clip,clip.videoWidth,clip.videoHeight);
                    }
                    const first=await sample(.05),last=await sample(.35);
                    encodedVideo={filename:video.filename,manifest:video.manifest,type:video.blob.type,width:clip.videoWidth,height:clip.videoHeight,first,last,sourceColors};
                }finally{clip.removeAttribute('src');clip.load();clip.remove();}
                }
                return {video:encodedVideo,canvasParity:capturedData,previews:results,stream:{closed:sink.closed,aborted:sink.aborted,bytes:stream.bytesWritten,
                    streamed:stream.streamed,hasBlob:!!stream.blob,manifest:stream.manifest,zip:data,
                    preview:previewData,previewRow:preview.manifest.frames[0]}};
            }finally{workers.forEach(w=>w.terminate());urls.forEach(u=>URL.revokeObjectURL(u));}
        }""", {"scripts": scripts, "liveVideo": live_video, "renderMethod": render_method})
        self.assertEqual([f['time'] for f in result['canvasParity']], [0, 200, 400])
        if live_video:
            video = result['video']
            self.assertEqual(video['type'], 'video/webm')
            self.assertTrue(video['filename'].endswith('_presentation.webm'))
            self.assertEqual((video['width'], video['height']), (1280, 720))
            self.assertEqual(video['manifest']['frameCount'], 4)
            self.assertEqual(video['manifest']['durationUs'], 400000)
            self.assertEqual(video['manifest']['outputStreams'], 1)
            self.assertEqual(video['manifest']['presentation']['cameraHudPlacement'], 'external')
            self.assertGreater(video['sourceColors'][0]['green'], 100, video['sourceColors'])
            self.assertGreater(video['sourceColors'][1]['cyan'], 100, video['sourceColors'])
            self.assertGreater(video['first']['green'], 100, video)
            self.assertGreater(video['last']['cyan'], 100, video)
        self.assertEqual([item['version'] for item in result['previews']], [2, 1])
        for item in result['previews']:
            self.assertEqual((item['width'], item['height']), (1280, 720))
            self.assertGreater(item['green'], 100)
            self.assertGreater(item['magenta'], 100)
            self.assertEqual(item['time'], 28200)
            self.assertEqual(item['sides'], ['presentation'])
            self.assertEqual(item['reference'], 'photo')
            self.assertEqual(item['author'], 'Observer')
            self.assertEqual(item['title'], 'Real observation')
            self.assertEqual(item['optical'], ['A', 'B'])
            self.assertEqual(item['zip'], 'application/zip')

        import base64
        import io
        import zipfile
        stream = result['stream']
        self.assertTrue(stream['closed'] and stream['streamed'])
        self.assertFalse(stream['aborted'] or stream['hasBlob'])
        payload = base64.b64decode(stream['zip'].split(',', 1)[1])
        self.assertEqual(stream['bytes'], len(payload))
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(archive.namelist(), ['frames/frame_00000_presentation.png',
                                                'frames/frame_00001_presentation.png',
                                                'frames/frame_00002_presentation.png', 'manifest.json'])
            for index, frame in enumerate(result['canvasParity']):
                self.assertEqual(base64.b64decode(frame['data'].split(',', 1)[1]), archive.read(f'frames/frame_{index:05d}_presentation.png'))
            manifest = json.loads(archive.read('manifest.json'))
            self.assertEqual(manifest, stream['manifest'])
            self.assertEqual(manifest['quality'], render_method)
            self.assertEqual(manifest['presentation']['cameraHudPlacement'], 'external')
            self.assertEqual([f['timeMs'] for f in manifest['frames']], [0, 200, 400])
            self.assertEqual([f['referenceId'] for f in manifest['frames']], ['photo', None, 'landscape'])
            self.assertEqual(len({f['topology'] for f in manifest['frames']}), 1)
            self.assertTrue(all(f['viewSize'] == manifest['frames'][0]['viewSize'] for f in manifest['frames']))
            for field in ['topology', 'viewSize', 'referenceId', 'timeMs']:
                self.assertEqual(stream['previewRow'][field], manifest['frames'][1][field])
            self.assertEqual(base64.b64decode(stream['preview'].split(',', 1)[1]),
                             archive.read('frames/frame_00001_presentation.png'))
            for name in archive.namelist()[:3]:
                self.assertEqual(archive.read(name)[:8], b'\x89PNG\r\n\x1a\n')

    def test_photo_calibration_correspondence_editor(self):
        import base64
        self.open_modern()
        self.page.wait_for_function("window.CurvatureModernApp?.getWorkspaceMode() === 'scene'")
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        dialog = self.page.locator('#ModernPhotoCalibration')
        expect(dialog).to_be_visible()
        expect(self.page.locator('#ModernWorkspace')).to_be_hidden()
        expect(self.page.locator('#ModernPhotoCalibrationOpen')).to_have_attribute('aria-pressed','true')
        expect(self.page.locator('#ModernSceneTab')).to_have_attribute('aria-pressed','false')
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getWorkspaceMode()"),'calibration')
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getMode()"),'scene')
        encoded = self.page.evaluate("""() => {
            const c=document.createElement('canvas');c.width=100;c.height=80;
            c.getContext('2d').fillRect(0,0,100,80);return c.toDataURL().split(',')[1];
        }""")
        dialog.locator('#ModernCalibrationFile').set_input_files(
            {'name':'reference.png','mimeType':'image/png','buffer':base64.b64decode(encoded)})
        expect(dialog.locator('#ModernCalibrationStatus')).to_contain_text('100 × 80')
        dialog.locator('#ModernCalibrationX').fill('25.5')
        dialog.locator('#ModernCalibrationY').fill('40.25')
        dialog.locator('#ModernCalibrationAdd').click()
        expect(dialog.locator('#ModernCalibrationCount')).to_have_text('1 correspondences')
        expect(dialog.locator('#ModernCalibrationPairs')).to_contain_text('25.50, 40.25')
        dialog.get_by_role('button',name='Edit',exact=True).click()
        dialog.locator('#ModernCalibrationX').fill('33')
        dialog.locator('#ModernCalibrationAdd').click()
        expect(dialog.locator('#ModernCalibrationPairs')).to_contain_text('33.00, 40.25')
        original_scene = self.page.evaluate("JSON.stringify([CurvatureModernApp.getModel().Height,CurvatureModernApp.getModel().FocalLengthField,CurvatureModernApp.getModel().CameraEast,CurvatureModernApp.getModel().CameraNorth,CurvatureModernApp.getModel().Pan,CurvatureModernApp.getModel().Nick,CurvatureModernApp.getModel().Roll,CurvatureModernApp.getModel().ObjType,CurvatureModernApp.getModel().NObjects,CurvatureModernApp.getPhotoCalibrationScene().physics])")
        self.page.locator('#ModernCompareTab').click()
        expect(dialog).to_be_hidden()
        expect(self.page.locator('#ModernWorkspace')).to_be_visible()
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        expect(dialog.locator('#ModernCalibrationPairs')).to_contain_text('33.00, 40.25')
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getMode()"),'compare')
        self.open_animation()
        expect(dialog).to_be_hidden()
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        expect(self.page.locator('#ModernAnimationWorkspace')).to_be_hidden()
        expect(dialog.locator('#ModernCalibrationCount')).to_have_text('1 correspondences')
        dialog.locator('#ModernCalibrationClose').click()
        expect(self.page.locator('#ModernWorkspace')).to_be_visible()
        self.assertEqual(self.page.evaluate("CurvatureModernApp.getWorkspaceMode()"),'scene')
        # Switching workspaces does not change physical Scene parameters.
        self.assertEqual(self.page.evaluate("JSON.stringify([CurvatureModernApp.getModel().Height,CurvatureModernApp.getModel().FocalLengthField,CurvatureModernApp.getModel().CameraEast,CurvatureModernApp.getModel().CameraNorth,CurvatureModernApp.getModel().Pan,CurvatureModernApp.getModel().Nick,CurvatureModernApp.getModel().Roll,CurvatureModernApp.getModel().ObjType,CurvatureModernApp.getModel().NObjects,CurvatureModernApp.getPhotoCalibrationScene().physics])"),original_scene)
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        expect(dialog.locator('#ModernCalibrationCount')).to_have_text('1 correspondences')
        dialog.get_by_role('button',name='Delete',exact=True).click()
        expect(dialog.locator('#ModernCalibrationCount')).to_have_text('0 correspondences')
        dialog.locator('#ModernCalibrationClose').click()

    def test_photo_calibration_full_scene_picking(self):
        import base64
        self.open_modern()
        self.page.wait_for_function("!document.getElementById('ModernPhotoCalibrationOpen').disabled")
        self.page.evaluate("""() => {
            const m=CurvatureModernApp.getModel();
            Object.assign(m,{Height:12,CameraEast:20,CameraNorth:90,Pan:1.2,Nick:.2,Roll:3,
                FocalLengthField:110,viewcenterHorizon:3,showModel:1,showGrid:0,
                ObjType:[3,3],NObjects:[1,0],ObjDist:[1700,0],ObjSidePos:[6,0],ObjSize:[23,64]});
            m.Update();
        }""")
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        workspace=self.page.locator('#ModernPhotoCalibration')
        expect(workspace.locator('#ModernCalibrationModelStatus')).to_contain_text('Canvas Direct')
        encoded=self.page.evaluate("""() => {
            const c=document.createElement('canvas');c.width=1200;c.height=900;
            c.getContext('2d').fillRect(0,0,1200,900);return c.toDataURL().split(',')[1];
        }""")
        workspace.locator('#ModernCalibrationFile').set_input_files(
            {'name':'reference.png','mimeType':'image/png','buffer':base64.b64decode(encoded)})
        expect(workspace.locator('#ModernCalibrationStatus')).to_contain_text('1200 × 900')
        before=self.page.evaluate("""() => {
            const e=CurvatureModernPhotoCalibrationEditor.mount(document),p=e.preview();
            return {valid:p.valid,count:p.points.length,
              pose:JSON.stringify([e.snapshot().model.Height,e.snapshot().model.Pan,e.snapshot().model.FocalLengthField])};
        }""")
        self.assertTrue(before['valid'])
        self.assertGreater(before['count'],0)
        photo=workspace.locator('#ModernCalibrationPhoto')
        photo.click(position={'x':photo.bounding_box()['width']/2,'y':photo.bounding_box()['height']/2})
        model=workspace.locator('#ModernCalibrationMesh')
        model.hover()
        self.page.mouse.wheel(0,-1000)
        # Actual pointer coordinates are derived from the backing-store viewport,
        # not from the photo raster or the physical camera parameters.
        hit=self.page.evaluate("""() => {
            const e=CurvatureModernPhotoCalibrationEditor.mount(document),p=e.preview();
            const c=document.getElementById('ModernCalibrationMesh'),r=c.getBoundingClientRect();
            const a=CurvatureModernPhotoCalibrationEditor;
            const candidates=p.points.filter(item=>item.painterVisible).map(item=>({item,xy:a.screenPoint(p.view,item.pixel)}))
              .filter(q=>q.xy[0]>12&&q.xy[0]<c.width-12&&q.xy[1]>12&&q.xy[1]<c.height-12);
            // Use rounded CSS pointer coordinates, matching actual input.
            for(const q of candidates){
              const x=Math.round(q.xy[0]*r.width/c.width),y=Math.round(q.xy[1]*r.height/c.height);
              const pick=e.inspectPick(x*c.width/r.width,y*c.height/r.height);
              if(pick.ids.length){
                if(!pick.ids.every(id=>p.points.find(v=>v.landmark.id===id).objectKey===pick.key))
                  throw Error('Cross-object pick');
                return {x,y,ids:pick.ids};
              }
            }
            throw Error('No painter-visible candidate in model viewport');
        }""")
        # Object selection is navigation, not an implicit correspondence edit.
        pending_before=workspace.locator('#ModernCalibrationX').input_value(),workspace.locator('#ModernCalibrationY').input_value()
        mode=workspace.locator('#ModernCalibrationPickMode')
        mode.select_option('object')
        model.click(position={'x':hit['x'],'y':hit['y']})
        selected=self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).objectSelection()")
        self.assertEqual(selected['owner']['bank'],0)
        self.assertEqual(selected['owner']['stationIndex'],0)
        expect(workspace.locator('#ModernCalibrationObjectSelection')).to_contain_text('horizontal range')
        expect(workspace.locator('#ModernCalibrationCount')).to_have_text('0 correspondences')
        self.assertEqual((workspace.locator('#ModernCalibrationX').input_value(),workspace.locator('#ModernCalibrationY').input_value()),pending_before)
        workspace.locator('#ModernCalibrationClearObject').click()
        self.assertIsNone(self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).objectSelection()"))
        workspace.locator('#ModernCalibrationObjectPicker').select_option(str(selected['key']))
        self.assertEqual(self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).objectSelection()"),selected)
        mode.select_option('vertex')
        model.hover(position={'x':hit['x'],'y':hit['y']})
        expect(workspace.locator('#ModernCalibrationPickStatus')).to_contain_text('Bank')
        model.click(position={'x':hit['x'],'y':hit['y']})
        expect(workspace.locator('#ModernCalibrationCount')).to_have_text('1 correspondences')
        result=self.page.evaluate("""() => {
            const s=CurvatureModernPhotoCalibrationEditor.mount(document).snapshot();
            return {id:s.observations[0].landmark.id,pixel:s.observations[0].pixel,
                pose:JSON.stringify([s.model.Height,s.model.Pan,s.model.FocalLengthField])};
        }""")
        self.assertIn(result['id'],hit['ids'])
        self.assertAlmostEqual(result['pixel'][0],600,delta=3)
        self.assertAlmostEqual(result['pixel'][1],450,delta=3)
        self.assertEqual(result['pose'],before['pose'])
        # Drag the existing photo marker, leaving its model ID and weight intact.
        photo.scroll_into_view_if_needed()
        r=photo.bounding_box()
        x,y=r['x']+r['width']/2,r['y']+r['height']/2
        self.page.mouse.move(x,y)
        self.page.mouse.down()
        self.page.mouse.move(x+30,y+20,steps=5)
        self.page.mouse.up()
        moved=self.page.evaluate("""() => CurvatureModernPhotoCalibrationEditor.mount(document).snapshot().observations[0]""")
        self.assertEqual(moved['landmark']['id'],result['id'])
        self.assertGreater(moved['pixel'][0],result['pixel'][0]+10)
        self.page.keyboard.press('Control+z')
        restored=self.page.evaluate("""() => CurvatureModernPhotoCalibrationEditor.mount(document).snapshot().observations[0].pixel""")
        self.assertEqual(restored,result['pixel'])
        workspace.locator('#ModernCalibrationFitModel').click()
        expect(workspace.locator('#ModernCalibrationCount')).to_have_text('1 correspondences')
        # Fit a single free angle using the real background worker.
        self.page.evaluate("""() => {
            for(const n of document.querySelectorAll('#ModernCalibrationFitParameters [data-fit-field]')){
                n.checked=n.dataset.fitField==='Pan';n.dispatchEvent(new Event('change',{bubbles:true}));
            }
        }""")
        workspace.locator('#ModernCalibrationRunFit').click()
        expect(workspace.locator('#ModernCalibrationBestView')).to_be_enabled(timeout=30000)
        expect(workspace.locator('#ModernCalibrationStopFit')).to_be_disabled(timeout=30000)
        fit=self.page.evaluate("""() => CurvatureModernPhotoCalibrationEditor.mount(document).fitResult()""")
        self.assertTrue(fit['evaluation']['valid'])
        self.assertLessEqual(fit['evaluation']['rmsPx'],fit['initialRmsPx']+1e-8)
        # Residuals are the worker's original-image pixel values, not canvas CSS pixels.
        panel=workspace.locator('#ModernCalibrationResidualPanel')
        expect(panel).to_be_visible()
        residual=panel.locator('tbody tr')
        expect(residual).to_have_count(1)
        self.assertAlmostEqual(float(residual.locator('[data-residual="error"]').inner_text()),fit['evaluation']['rmsPx'],delta=.006)
        self.assertAlmostEqual(float(residual.locator('[data-residual="initialError"]').inner_text()),fit['initialRmsPx'],delta=.006)
        for axis,index in [('dx',0),('dy',1)]:
            self.assertAlmostEqual(float(residual.locator('[data-residual="'+axis+'"]').inner_text()),fit['evaluation']['points'][0]['residual'][index],delta=.006)
        select=workspace.locator('#ModernCalibrationResidualMode')
        expect(select).to_have_value('best')
        residual.get_by_role('button',name='Select correspondence 1').click()
        expect(residual.get_by_role('button',name='Select correspondence 1')).to_have_attribute('aria-pressed','true')
        with_overlay=photo.evaluate('(c)=>c.toDataURL()')
        select.select_option('off')
        self.assertNotEqual(photo.evaluate('(c)=>c.toDataURL()'),with_overlay)
        select.select_option('initial')
        self.assertNotEqual(photo.evaluate('(c)=>c.toDataURL()'),with_overlay)
        select.select_option('best')
        self.assertEqual(self.page.evaluate("""() => {
            const s=CurvatureModernPhotoCalibrationEditor.mount(document).snapshot();
            return JSON.stringify([s.model.Height,s.model.Pan,s.model.FocalLengthField]);
        }"""),before['pose'])
        workspace.locator('#ModernCalibrationBestView').click()
        expect(workspace.locator('#ModernCalibrationCount')).to_have_text('1 correspondences')
        # Navigating objects must not invalidate a completed physical fit.
        mode.select_option('object')
        workspace.locator('#ModernCalibrationObjectPicker').select_option(str(selected['key']))
        self.assertEqual(self.page.evaluate("CurvatureModernPhotoCalibrationEditor.mount(document).fitResult()"),fit)
        mode.select_option('vertex')
        # Real exported file, import into the draft, then check the solver input.
        with self.page.expect_download() as info:
            workspace.locator('#ModernCalibrationExportExperiment').click()
        download=info.value
        with open(download.path(),encoding='utf-8') as stream:
            exported=json.load(stream)
        self.assertEqual(exported['fit']['freeParameters'],['Pan'])
        self.assertEqual(exported['fit']['result'],fit)
        self.assertEqual(exported['referenceImage']['original']['width'],1200)
        self.page.once('dialog',lambda dialog:dialog.accept())
        workspace.locator('#ModernCalibrationExperimentFile').set_input_files(str(download.path()))
        expect(workspace.locator('#ModernCalibrationExchangeStatus')).to_have_text('Experiment imported.')
        after=self.page.evaluate("""() => CurvatureModernPhotoCalibrationEditor.mount(document).exportExperiment()""")
        self.assertEqual(after['observations'],exported['observations'])
        self.assertEqual(after['scene'],exported['scene'])
        self.assertEqual(after['fit']['result'],exported['fit']['result'])
        self.assertEqual(after['referenceImage'],exported['referenceImage'])
        self.assertEqual(after['fit']['freeParameters'],['Pan'])
        expect(panel).to_be_visible()
        expect(residual).to_have_count(1)
        expect(residual.locator('[data-residual="error"]')).to_have_text(f"{fit['evaluation']['rmsPx']:.2f}")
        # Invalidation must remove stale vectors and results.
        workspace.locator('[data-fit-field="Roll"]').check()
        expect(panel).to_be_hidden()
        expect(select).to_be_disabled()
        expect(residual).to_have_count(0)
        # Holding out the only point disables fitting; role survives export and Undo.
        role=workspace.locator('#ModernCalibrationPairs').get_by_role('checkbox',name='Use correspondence 1 for fit')
        role.uncheck()
        expect(workspace.locator('#ModernCalibrationRunFit')).to_be_disabled()
        expect(workspace.locator('#ModernCalibrationRoleCount')).to_contain_text('0 Fit · 1 Validation')
        held=self.page.evaluate("""() => CurvatureModernPhotoCalibrationEditor.mount(document).exportExperiment()""")
        self.assertEqual(held['version'],2)
        self.assertFalse(held['observations'][0]['included'])
        self.assertIsNone(held['fit']['result'])
        workspace.locator('#ModernCalibrationUndo').click()
        expect(role).to_be_checked()
        expect(workspace.locator('#ModernCalibrationRunFit')).to_be_enabled()

    def test_all_workspace_tabs_restore_through_same_preference(self):
        self.open_modern()
        tabs={'scene':'ModernSceneTab','compare':'ModernCompareTab',
              'animation':'ModernAnimationTab','calibration':'ModernPhotoCalibrationOpen',
              'demos':'ModernDemosTab'}
        for mode in ['compare','animation','calibration','demos','scene']:
            with self.subTest(mode=mode):
                self.page.locator('#'+tabs[mode]).click()
                self.page.wait_for_function("m => CurvatureModernApp.getWorkspaceMode() === m",arg=mode)
                self.assertEqual(self.page.evaluate("""() => JSON.parse(localStorage.getItem(
                    CurvatureModernApplicationPreferences.STORAGE_KEY)).workspace.mode"""),mode)
                self.page.reload(wait_until='load')
                self.page.wait_for_function("m => CurvatureModernApp.getWorkspaceMode() === m",arg=mode)
                for key,tab in tabs.items():
                    expect(self.page.locator('#'+tab)).to_have_attribute(
                        'aria-pressed','true' if key==mode else 'false')
                expect(self.page.locator('#ModernPhotoCalibration')).to_be_visible() if mode=='calibration' else expect(self.page.locator('#ModernPhotoCalibration')).to_be_hidden()
                expect(self.page.locator('#ModernAnimationWorkspace')).to_be_visible() if mode=='animation' else expect(self.page.locator('#ModernAnimationWorkspace')).to_be_hidden()

    def test_explicit_workspace_link_then_user_choice_survives_reload(self):
        self.open_modern()
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        self.page.goto(self.base_url+'?mode=compare',wait_until='load')
        self.page.wait_for_function("CurvatureModernApp.getWorkspaceMode() === 'compare'")
        self.page.locator('#ModernAnimationTab').click()
        self.page.reload(wait_until='load')
        self.page.wait_for_function("CurvatureModernApp.getWorkspaceMode() === 'animation'")
        expect(self.page.locator('#ModernAnimationTab')).to_have_attribute('aria-pressed','true')

    def test_photo_calibration_reload_restores_draft(self):
        import base64
        self.open_modern()
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        dialog=self.page.locator('#ModernPhotoCalibration')
        encoded=self.page.evaluate("""() => {const c=document.createElement('canvas');c.width=100;c.height=80;return c.toDataURL().split(',')[1];}""")
        dialog.locator('#ModernCalibrationFile').set_input_files(
            {'name':'reload.png','mimeType':'image/png','buffer':base64.b64decode(encoded)})
        expect(dialog.locator('#ModernCalibrationStatus')).to_contain_text('100 × 80')
        dialog.locator('#ModernCalibrationX').fill('25')
        dialog.locator('#ModernCalibrationY').fill('35')
        dialog.locator('#ModernCalibrationAdd').click()
        expect(dialog.locator('#ModernCalibrationStorage')).to_have_text('Draft saved in this browser.')
        self.page.reload()
        expect(dialog).to_be_visible()
        expect(dialog.locator('#ModernCalibrationCount')).to_have_text('1 correspondences')
        expect(dialog.locator('#ModernCalibrationPairs')).to_contain_text('25.00, 35.00')
        expect(dialog.locator('#ModernCalibrationPhotoInfo')).to_contain_text('100 × 80')

    def test_photo_calibration_existing_originals(self):
        self.open_modern()
        self.page.wait_for_function("window.CurvatureModernApp?.getWorkspaceMode() === 'scene'")
        original = self.page.evaluate("""async () => {
            const c=document.createElement('canvas');c.width=100;c.height=80;
            c.getContext('2d').fillRect(0,0,100,80);
            const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));
            const record=await CurvatureModernReferenceImageImport.ingest(
                new File([blob],'Library photo.png',{type:'image/png'}),'calibration-existing',window);
            await CurvatureModernReferenceImageLibrary.create(indexedDB,record);
            const catalog=window.CurvatureModernDemoCatalog;
            const shipped=catalog.load();
            const embedded=await CurvatureModernReferenceImageImport.ingest(
                new File([blob],'Embedded observation.png',{type:'image/png'}),'calibration-existing',window);
            const demo={id:'test-embedded',project:{name:'Test embedded project',keyframes:[
                {name:'Test frame',referenceImageIds:[embedded.id]}]},referenceImages:[embedded]};
            // Production catalog entries need not contain reference originals.
            // Test the read-only embedded source with an explicit original.
            window.CurvatureModernDemoCatalog={...catalog,load:()=>[...shipped,demo]};
            return {key:JSON.stringify(['demo',demo.id,embedded.id]),
                    title:embedded.title,width:embedded.original.width,height:embedded.original.height};
        }""")
        self.page.locator('#ModernPhotoCalibrationOpen').click()
        dialog=self.page.locator('#ModernPhotoCalibration')
        picker=dialog.locator('#ModernCalibrationSource')
        local_key=json.dumps(['library','calibration-existing'],separators=(',',':'))
        expect(picker.locator('option',has_text='Library photo.png')).to_have_count(1)
        picker.select_option(value=local_key)
        dialog.locator('#ModernCalibrationUsePhoto').click()
        expect(dialog.locator('#ModernCalibrationPhotoInfo')).to_contain_text('100 × 80')
        dialog.locator('#ModernCalibrationX').fill('25')
        dialog.locator('#ModernCalibrationY').fill('35')
        dialog.locator('#ModernCalibrationAdd').click()
        dialog.locator('#ModernCalibrationUsePhoto').click()
        expect(dialog.locator('#ModernCalibrationCount')).to_have_text('1 correspondences')
        picker.select_option(value=original['key'])
        self.page.once('dialog',lambda prompt: prompt.dismiss())
        dialog.locator('#ModernCalibrationUsePhoto').click()
        expect(dialog.locator('#ModernCalibrationCount')).to_have_text('1 correspondences')
        self.page.once('dialog',lambda prompt: prompt.accept())
        dialog.locator('#ModernCalibrationUsePhoto').click()
        expect(dialog.locator('#ModernCalibrationPhotoInfo')).to_contain_text(original['title'])
        expect(dialog.locator('#ModernCalibrationPhotoInfo')).to_contain_text(
            f"{original['width']} × {original['height']}")
        expect(dialog.locator('#ModernCalibrationCount')).to_have_text('0 correspondences')
        self.assertEqual(self.page.evaluate("""async () =>
            (await CurvatureModernReferenceImageLibrary.list(indexedDB)).map(r=>r.id)"""),
            ['calibration-existing'])
        dialog.locator('#ModernCalibrationClose').click()

    def test_reference_image_library_roundtrip(self):
        import base64
        payload = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOo6TsAAANUAcuEDSEIAAAAAElFTkSuQmCC')
        self.open_modern()
        self.open_animation()
        panel = self.page.locator('#ModernReferenceImageLibrary')
        panel.locator('summary').first.click()
        expect(panel.get_by_role('status')).to_contain_text('ready')
        panel.locator('input[type=file]').set_input_files({'name': 'observation.png', 'mimeType': 'image/png', 'buffer': payload})
        expect(panel.get_by_role('status')).to_contain_text('Photograph imported')
        panel.get_by_label('Title', exact=True).fill('Causeway test')
        panel.get_by_label('Author', exact=True).fill('Observer')
        panel.get_by_text('Save details', exact=True).click()
        expect(panel.get_by_role('status')).to_contain_text('metadata saved')
        self.page.reload(wait_until='load')
        self.open_animation()
        panel.locator('summary').first.click()
        expect(panel.get_by_role('status')).to_contain_text('ready')
        panel.get_by_label('Saved observations').select_option(label='Causeway test (1 × 1)')
        expect(panel.get_by_label('Author', exact=True)).to_have_value('Observer')
        self.assertEqual(panel.get_by_text('Download original').get_attribute('href'),
                         'data:image/png;base64,' + base64.b64encode(payload).decode())
        expect(panel.get_by_text('Delete observation', exact=True)).to_be_disabled()
        expect(panel.get_by_text('Deletion is temporarily disabled', exact=False)).to_be_visible()

    def test_keyframe_reference_links_roundtrip(self):
        import base64
        payload = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOo6TsAAANUAcuEDSEIAAAAAElFTkSuQmCC')
        self.open_modern()
        self.open_animation()
        self.create_camera_project('CI Reference Links')
        observations = self.page.locator('#ModernReferenceImageLibrary')
        observations.locator('summary').first.click()
        expect(observations.get_by_role('status')).to_contain_text('ready')
        observations.locator('input[type=file]').set_input_files({'name': 'observation.png', 'mimeType': 'image/png', 'buffer': payload})
        expect(observations.get_by_role('status')).to_contain_text('Photograph imported')
        editor = self.page.locator('#ModernAnimationStudio')
        links = editor.locator('.modern-studio-reference-links')
        links.get_by_text('Load photographs', exact=True).click()
        expect(links.get_by_role('status')).to_contain_text('Local library loaded')
        photo_id = self.page.evaluate("async () => (await CurvatureModernReferenceImageLibrary.list(indexedDB))[0].id")
        expect(links.locator('.modern-reference-choice img')).to_be_visible()
        links.locator('.modern-reference-choice').filter(has_text='observation.png').click()
        links.get_by_text('Attach', exact=True).click()
        expect(links).to_contain_text('Reference photographs (1)')
        expect(links.locator('.modern-studio-reference-row')).to_contain_text('observation.png')
        expect(links.locator('.modern-studio-reference-row img')).to_be_visible()
        links.get_by_role('button', name='View original photograph 1').click()
        expect(links.locator('dialog img')).to_be_visible()
        links.get_by_text('Close photograph', exact=True).click()
        editor.locator('.modern-studio-edit-undo').last.click()
        expect(links).to_contain_text('Reference photographs (0)')
        editor.locator('.modern-studio-edit-redo').last.click()
        expect(links).to_contain_text('Reference photographs (1)')
        self.page.locator('#ModernAnimationLibrary').get_by_text('Save changes', exact=True).click()
        self.page.wait_for_function("async id => (await CurvatureModernAnimationLibrary.list(indexedDB))[0].project.keyframes[0].referenceImageIds?.[0] === id", arg=photo_id)
        self.page.reload(wait_until='load')
        self.open_animation()
        expect(links.locator('.modern-studio-reference-row')).to_contain_text('observation.png')
        links.get_by_text('Unlink', exact=True).click()
        expect(links).to_contain_text('Reference photographs (0)')
        self.assertEqual(self.page.evaluate('async () => (await CurvatureModernReferenceImageLibrary.list(indexedDB)).length'), 1)

    def test_reference_portable_bundle_import_and_export(self):
        self.open_modern()
        self.open_animation()
        # A complete synthetic bundle from another browser, with a conflicting local ID.
        wire = self.page.evaluate("""async () => {
            const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOo6TsAAANUAcuEDSEIAAAAAElFTkSuQmCC';
            const original = {dataUrl: png, width: 1, height: 1};
            const asset = {version: 1, id: 'portable_photo', title: 'Imported observation',
                           author: 'Observer', original};
            await CurvatureModernReferenceImageLibrary.create(indexedDB, {...asset, title: 'Local observation'});
            const draft = structuredClone(CurvatureModernDemoCatalog.load()[0].project);
            draft.keyframes[0].referenceImageIds = [asset.id];
            draft.keyframes[1].referenceImageIds = [asset.id];
            const entry = CurvatureModernAnimationLibrary.record(draft, 'auto', draft.id, 1, 1);
            return CurvatureModernAnimationLibrary.exportPortable([entry], undefined, {referenceImages: [asset]});
        }""")
        library = self.page.locator('#ModernAnimationLibrary')
        def import_bundle():
            library.get_by_label('Import animation JSON file').set_input_files({
                'name': 'portable.json', 'mimeType': 'application/json', 'buffer': wire.encode('utf-8')})
        import_bundle()
        expect(library.get_by_text('My Projects · 1', exact=True)).to_be_visible()
        result = self.page.evaluate("""async () => {
            const projects = await CurvatureModernAnimationLibrary.list(indexedDB);
            const ids = projects[0].project.keyframes.slice(0, 2).map(f => f.referenceImageIds[0]);
            return {ids, incoming: (await CurvatureModernReferenceImageLibrary.get(indexedDB, ids[0])).record,
                local: (await CurvatureModernReferenceImageLibrary.get(indexedDB, 'portable_photo')).record};
        }""")
        self.assertEqual(result['ids'][0], result['ids'][1])
        self.assertNotEqual(result['ids'][0], 'portable_photo')
        self.assertEqual(result['local']['title'], 'Local observation')
        self.assertEqual(result['incoming']['title'], 'Imported observation')
        with self.page.expect_download() as download:
            library.get_by_text('Export all', exact=True).click()
        exported = json.loads(Path(download.value.path()).read_text(encoding='utf-8'))
        self.assertEqual(exported['version'], 2)
        self.assertEqual(exported['referenceImages'], [result['incoming']])
        import_bundle()
        expect(library).to_contain_text('Imported 0 animations; 1 already present')
        self.assertEqual(self.page.evaluate('async () => (await CurvatureModernReferenceImageLibrary.list(indexedDB)).length'), 2)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def assert_preview_fills_panels(self):
        # CSS pixels, not the DPR-scaled backing dimensions.
        self.page.wait_for_function("""() => ['A', 'B'].every(side => {
            const host = document.getElementById('ModernAnimationCanvas' + side);
            const graph = window.CurvatureModernAnimationGraphs?.[side];
            const width = host.getBoundingClientRect().width;
            if (width < 2) return true;
            const canvas = graph?.Canvas;
            const rect = canvas?.getBoundingClientRect();
            return rect && rect.width > 2 && Math.abs(width - rect.width - 2*graph.BorderWidth) <= 2
                && Math.abs(rect.height/rect.width - 0.6667) < 0.01
                && Math.abs(canvas.height/canvas.width - 0.6667) < 0.01
                && document.getElementById('ModernAnimationFrameLoading' + side).hidden;
        })""", timeout=30000)

    def test_soundly_reference_presentation_layout(self):
        import base64
        payload = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGOo6TsAAANUAcuEDSEIAAAAAElFTkSuQmCC')
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text('Create copy', exact=True).click()
        observations = self.page.locator('#ModernReferenceImageLibrary')
        observations.locator('summary').first.click()
        expect(observations.get_by_role('status')).to_contain_text('ready')
        observations.locator('input[type=file]').set_input_files({'name': 'observation.png', 'mimeType': 'image/png', 'buffer': payload})
        expect(observations.get_by_role('status')).to_contain_text('Photograph imported')
        editor = self.page.locator('#ModernAnimationStudio .modern-studio-editor-details')
        if editor.get_attribute('open') is None:
            editor.locator('summary').click()
        editor.locator('.modern-studio-keyframe').first.click()
        links = editor.locator('.modern-studio-reference-links')
        links.get_by_text('Load photographs', exact=True).click()
        expect(links.locator('.modern-reference-choice img')).to_be_visible()
        links.locator('.modern-reference-choice').first.click()
        links.get_by_text('Attach', exact=True).click()
        editor.locator('.modern-studio-keyframe').first.click()
        ref_panel = self.page.locator('#ModernAnimationReferencePanel')
        layout = self.page.locator('#ModernAnimationReferenceLayout')
        expect(ref_panel.locator('img')).to_be_visible(timeout=30000)
        self.assert_preview_fills_panels()
        layout.select_option('below')
        expect(self.page.locator('#ModernAnimationPlaybackPanels')).to_have_class(re.compile('has-reference-below'))
        self.assert_preview_fills_panels()
        layout.select_option('hidden')
        expect(ref_panel).to_be_hidden()
        self.assert_preview_fills_panels()
        layout.select_option('side')
        expect(ref_panel.locator('img')).to_be_visible()
        self.assert_preview_fills_panels()
        self.page.locator('#ModernAnimationPresent').click()
        expect(ref_panel.locator('img')).to_be_visible()
        self.assert_preview_fills_panels()
        chapter = self.page.locator('#ModernAnimationNarrativeNavigation')
        chapter.select_option('6')
        expect(ref_panel).to_be_hidden()
        self.assert_preview_fills_panels()
        chapter.select_option('0')
        expect(ref_panel.locator('img')).to_be_visible()
        self.assert_preview_fills_panels()
        ref_panel.get_by_text('View original & details').click()
        expect(self.page.locator('#ModernAnimationPlaybackStage dialog img')).to_be_visible()
        self.page.locator('#ModernAnimationPlaybackStage dialog').get_by_text('Close photograph').click()
        self.page.locator('#ModernAnimationPresentationExit').click()
        splitter = self.page.locator('#ModernAnimationReferenceSplitter')
        splitter.focus()
        self.page.keyboard.press('ArrowRight')
        expect(splitter).to_have_attribute('aria-valuenow', '35')
        self.assert_preview_fills_panels()
        self.page.locator('#ModernAnimationPlaybackSeek').evaluate("el => {el.value=100;el.dispatchEvent(new Event('input',{bubbles:true}));}")
        expect(ref_panel.locator('img')).to_be_hidden()
        editor.locator('.modern-studio-keyframe').first.click()
        expect(ref_panel.locator('img')).to_be_visible()
        # Real Studio copy, reference import/attachment and HTTP worker imports.
        export = self.page.locator('#ModernAnimationFrameExportStart').locator('xpath=ancestor::details[1]')
        if export.get_attribute('open') is None:
            export.locator('summary').click()
        self.page.locator('#ModernAnimationFrameExportMode').select_option('presentation')
        self.page.locator('#ModernAnimationFrameExportPresentationSize').select_option('1280')
        self.page.locator('#ModernAnimationFrameExportFps').select_option('25')
        self.page.locator('#ModernAnimationFrameExportDestination').select_option('memory')
        self.page.locator('#ModernAnimationFrameExportStart').click()
        status = self.page.locator('#ModernAnimationFrameExportStatus')
        expect(status).to_contain_text('1479 requested; maximum 751')
        self.page.locator('#ModernAnimationFrameExportPreview').click()
        expect(status).to_contain_text('Presentation preview ready', timeout=120000)
        expect(self.page.locator('#ModernAnimationFrameExportPreviewImage')).to_be_visible()
        with self.page.expect_download() as download:
            self.page.locator('#ModernAnimationFrameExportPreviewSave').click()
        self.assertTrue(download.value.suggested_filename.endswith('.zip'))

    def test_shipped_demo_catalog_http(self):
        self.open_modern()
        self.assert_shipped_demo_catalog()

    def test_shipped_demo_catalog_file(self):
        # Local classic script resources must work without fetch(file://).
        self.page.goto((ROOT / 'CurvatureModern.html').as_uri(), wait_until='load', timeout=30000)
        self.assert_shipped_demo_catalog()

    def test_soundly_compare_playback_seek_and_restart(self):
        self.open_modern()
        self.open_animation()
        library = self.page.locator('#ModernAnimationLibrary')
        library.locator('[data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        stage = self.page.locator('#ModernAnimationPlaybackStage')
        expect(stage).to_be_visible()
        expect(self.page.locator('#ModernAnimationPlaybackLabelA')).to_have_text('Model A · Globe · vacuum')
        expect(self.page.locator('#ModernAnimationPlaybackLabelB')).to_have_text('Model B · Flat · vacuum')
        expect(self.page.locator('#ModernAnimationPlaybackViewB')).to_be_visible()
        expect(self.page.locator('#ModernAnimationPlaybackOptics')).to_have_value('canvas-direct')
        diag = self.page.locator('#ModernAnimationPlaybackDiagnostics')
        expect(diag).to_contain_text('B: canvas-direct', timeout=30000)
        seek = self.page.locator('#ModernAnimationPlaybackSeek')
        seek.evaluate("el => { el.value = 400; el.dispatchEvent(new Event('input', {bubbles:true})); }")
        expect(diag).to_contain_text('Rendered t=23.64s')
        self.page.locator('#ModernAnimationPlaybackPlay').click()
        self.page.wait_for_function('CurvatureModernApp.getStudioPlayback().positionMs > 23640')
        self.page.locator('#ModernAnimationPlaybackPause').click()
        self.assertFalse(self.page.evaluate('CurvatureModernApp.getStudioPlayback().playing'))
        self.page.locator('#ModernAnimationPlaybackStop').click()
        expect(diag).to_contain_text('Rendered t=0.00s')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), 0)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_soundly_keyframe_navigation_and_personal_auto_prepare(self):
        self.open_modern()
        self.open_animation()
        library = self.page.locator('#ModernAnimationLibrary')
        library.locator('[data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        diag = self.page.locator('#ModernAnimationPlaybackDiagnostics')
        expect(diag).to_contain_text('Rendered t=0.00s', timeout=30000)
        cards = self.page.locator('#ModernAnimationStoryboard .modern-animation-storyboard-card')
        # The first jump must paint before Play has ever been clicked.
        cards.nth(3).click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        self.assertFalse(self.page.evaluate('CurvatureModernApp.getStudioPlayback().playing'))
        cards.nth(1).click()
        expect(diag).to_contain_text('Rendered t=8.50s')
        self.page.locator('#ModernAnimationPlaybackPlay').click()
        cards.nth(3).click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        expect(cards.nth(3)).to_have_attribute('aria-pressed', 'true')
        expect(self.page.locator('#ModernAnimationPlaybackTime')).to_contain_text('20.95 / 59.10 s')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), 20950)
        self.assertFalse(self.page.evaluate('CurvatureModernApp.getStudioPlayback().playing'))
        cards.nth(0).click()
        expect(diag).to_contain_text('Rendered t=0.00s')
        self.page.locator('#ModernAnimationPlaybackStop').click()
        cards.nth(5).click()
        expect(diag).to_contain_text('Rendered t=35.40s')
        self.assertFalse(self.page.evaluate('CurvatureModernApp.getStudioPlayback().playing'))
        library.locator('[data-demo-id="soundly"]').get_by_text('Create copy', exact=True).click()
        expect(cards).to_have_count(9)
        self.page.wait_for_function('CurvatureModernApp.getBuiltInDemo() === null')
        editor = self.page.locator('#ModernAnimationStudio .modern-studio-editor-details')
        editor.locator('summary').click()
        expect(editor).not_to_have_attribute('open', '')
        cards.nth(2).click()
        expect(diag).to_contain_text('Rendered t=15.00s')
        expect(editor).not_to_have_attribute('open', '')
        expect(editor.locator('.modern-studio-keyframe').nth(2)).to_have_attribute('aria-pressed', 'true')
        editor.locator('summary').click()
        name = self.page.locator('#ModernAnimationStudio').get_by_label('Project name')
        name.fill('Soundly navigation check')
        name.press('Tab')
        self.page.wait_for_function('CurvatureModernApp.getStudioPlayback() === null')
        self.page.locator('#ModernAnimationStudio .modern-studio-keyframe').nth(3).click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        expect(cards.nth(3)).to_have_attribute('aria-pressed', 'true')
        self.assertFalse(self.page.evaluate('CurvatureModernApp.getStudioPlayback().playing'))
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_soundly_presentation_reuses_player_and_storyboard(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        diag = self.page.locator('#ModernAnimationPlaybackDiagnostics')
        expect(diag).to_contain_text('Rendered t=0.00s', timeout=30000)
        stage = self.page.locator('#ModernAnimationPlaybackStage')
        self.page.locator('#ModernAnimationPresent').click()
        expect(stage).to_have_class(re.compile('is-presenting'))
        expect(self.page.locator('#ModernAnimationPresentationTitle')).to_contain_text('Soundly')
        expect(self.page.locator('#ModernAnimationPlaybackOptics')).not_to_be_visible()
        expect(self.page.locator('#ModernAnimationPlaybackQuality')).to_be_visible()
        self.assertTrue(self.page.locator('#ModernAnimationLibrary').evaluate('(el) => el.inert'))
        story = self.page.locator('#ModernAnimationStoryboard')
        cards = story.locator('.modern-animation-storyboard-card')
        settings = self.page.locator('#ModernAnimationPresentationSettingsToggle')
        toggle = self.page.locator('#ModernAnimationPresentationStoryboardToggle')
        expect(story).to_be_hidden()
        expect(self.page.locator('#ModernAnimationPlaybackRetry')).to_be_hidden()
        expect(self.page.locator('#ModernAnimationPlaybackStatus')).to_be_hidden()
        expect(self.page.locator('#ModernAnimationAtmosphere')).to_be_hidden()
        settings.click()
        expect(settings).to_have_attribute('aria-expanded', 'true')
        expect(self.page.locator('#ModernAnimationAtmosphere')).to_be_visible()
        self.assert_preview_fills_panels()
        settings.click()
        expect(self.page.locator('#ModernAnimationAtmosphere')).to_be_hidden()
        toggle.click()
        expect(toggle).to_have_attribute('aria-expanded', 'true')
        self.assert_preview_fills_panels()
        expect(cards).to_have_count(9)
        for name in ('Capture all keyframes', 'Regenerate all thumbnails', 'Export with thumbnails', 'Export without thumbnails'):
            author_action = story.get_by_text(name, exact=True)
            expect(author_action).to_have_count(1)
            expect(author_action).to_be_hidden()
        expect(story.locator('.modern-animation-author-only').first).to_be_hidden()
        cards.nth(3).click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        expect(self.page.locator('#ModernAnimationPresentationFrame')).to_contain_text('4 / 9')
        toggle.click()
        expect(story).to_be_hidden()
        # Exercise the conditional recovery chrome without changing the renderer.
        self.assertTrue(stage.evaluate("""el => {
            const notice = el.querySelector('#ModernAnimationFrameLoadingA');
            const status = el.querySelector('#ModernAnimationPlaybackStatus');
            const old = status.getAttribute('data-status-kind'), hidden = notice.hidden;
            notice.classList.add('is-failed'); notice.hidden = false;
            status.setAttribute('data-status-kind', 'warning');
            const visible = id => getComputedStyle(el.querySelector('#'+id)).display !== 'none';
            const result = visible('ModernAnimationPlaybackRetry') && visible('ModernAnimationPlaybackStatus');
            notice.classList.remove('is-failed'); notice.hidden = hidden;
            if (old === null) status.removeAttribute('data-status-kind'); else status.setAttribute('data-status-kind', old);
            return result;
        }"""))
        self.page.set_viewport_size({'width': 1200, 'height': 800})
        self.assert_preview_fills_panels()
        expect(self.page.locator('#ModernAnimationPlaybackTime')).to_contain_text('20.95')
        self.page.keyboard.press('Escape')
        expect(stage).not_to_have_class(re.compile('is-presenting'))
        self.assert_preview_fills_panels()
        expect(self.page.locator('#ModernAnimationPlaybackTime')).to_contain_text('20.95')
        self.assertFalse(self.page.locator('#ModernAnimationLibrary').evaluate('(el) => el.inert'))
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getBuiltInDemo()'), 'soundly')
        expect(story.get_by_role('button', name='Export without thumbnails', exact=True)).to_be_visible()
        expect(self.page.locator('#ModernAnimationAtmosphere')).to_be_visible()
        expect(self.page.locator('#ModernAnimationPlaybackRetry')).to_be_visible()
        expect(settings).to_be_hidden()
        self.page.locator('#ModernAnimationPresent').click()
        expect(story).to_be_hidden()
        self.page.locator('#ModernAnimationPresentationExit').click()

    def test_soundly_atmosphere_switch_preserves_authored_project_and_playhead(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        diag = self.page.locator('#ModernAnimationPlaybackDiagnostics')
        expect(diag).to_contain_text('Rendered t=0.00s', timeout=30000)
        cards = self.page.locator('#ModernAnimationStoryboard .modern-animation-storyboard-card')
        cards.nth(3).click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        switch = self.page.locator('#ModernAnimationAtmosphere')
        authored = self.page.evaluate('CurvatureModernApp.getAnimationStudioProject()')
        expect(switch).to_have_value('vacuum')
        self.page.locator('#ModernAnimationPresent').click()
        self.page.locator('#ModernAnimationPresentationSettingsToggle').click()
        expect(switch).to_be_visible()
        switch.select_option('standard')
        expect(self.page.locator('#ModernAnimationPlaybackLabelA')).to_have_text('Model A · Globe · standard', timeout=30000)
        expect(self.page.locator('#ModernAnimationPlaybackLabelB')).to_have_text('Model B · Flat · standard')
        expect(diag).to_contain_text('Rendered t=20.95s')
        expect(cards.nth(3)).to_have_attribute('aria-pressed', 'true')
        self.assertEqual(cards.nth(3).locator('img').count(), 0)
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getAnimationStudioProject()'), authored)
        self.page.locator('#ModernAnimationPresentationExit').click()
        story = self.page.locator('#ModernAnimationStoryboard')
        with self.page.expect_download(timeout=60000) as download:
            story.get_by_role('button', name='Export with thumbnails (standard)', exact=True).click()
        self.assertIn('-standard-', download.value.suggested_filename)
        variant = json.loads(Path(download.value.path()).read_text(encoding='utf-8'))['animations'][0]
        self.assertEqual(len(variant['keyframeThumbnails']), 9)
        self.assertEqual(variant['project']['baseExperiment']['compare']['A']['atmosphere'], 'standard')
        self.assertEqual(variant['project']['baseExperiment']['compare']['B']['atmosphere'], 'standard')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getAnimationStudioProject()'), authored)
        switch.select_option('vacuum')
        expect(self.page.locator('#ModernAnimationPlaybackLabelA')).to_have_text('Model A · Globe · vacuum')
        expect(cards.nth(3).locator('img')).to_have_count(1)
        expect(switch).to_have_value('vacuum')
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getStudioPlayback().positionMs'), 20950)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_soundly_copy_narrative_follows_storyboard_and_is_plain_text(self):
        self.open_modern()
        self.open_animation()
        demo = self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]')
        demo.get_by_text('Create copy', exact=True).click()
        editor = self.page.locator('#ModernAnimationStudio')
        details = editor.locator('.modern-studio-editor-details')
        if not details.locator('summary').evaluate('(el) => el.parentElement.open'):
            details.locator('summary').click()
        editor.locator('.modern-studio-keyframe').nth(3).click()
        heading = editor.get_by_label('Presentation title (optional)')
        heading.fill('Real observation')
        heading.press('Tab')
        caption = editor.get_by_label('Frame explanation (optional)')
        literal = '<b>Low view</b>\nBridge explanation'
        caption.fill(literal)
        caption.press('Tab')
        editor.locator('.modern-studio-keyframe').nth(3).click()
        diag = self.page.locator('#ModernAnimationPlaybackDiagnostics')
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        self.page.locator('#ModernAnimationPresent').click()
        narrative = self.page.locator('#ModernAnimationPresentationNarrative')
        text = self.page.locator('#ModernAnimationPresentationNarrativeText')
        expect(narrative).to_be_visible()
        expect(text).to_have_text(literal)
        expect(text.locator('b')).to_have_count(0)
        expect(self.page.locator('#ModernAnimationPresentationNarrativeLabel')).to_have_text('4 / 9 · Real observation')
        self.page.locator('#ModernAnimationPresentationSettingsToggle').click()
        visibility = self.page.get_by_label('Show explanations')
        visibility.uncheck()
        expect(narrative).not_to_be_visible()
        visibility.check()
        expect(narrative).to_be_visible()
        navigation = self.page.get_by_label('Presentation chapter')
        navigation.select_option('4')
        expect(text).to_be_empty()
        navigation.select_option('3')
        expect(text).to_have_text(literal)
        self.page.keyboard.press('Escape')
        expect(narrative).not_to_be_visible()

    def test_soundly_lazy_keyframe_thumbnails(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        diag = self.page.locator('#ModernAnimationPlaybackDiagnostics')
        expect(diag).to_contain_text('Rendered t=0.00s', timeout=30000)
        story = self.page.locator('#ModernAnimationStoryboard')
        cards = story.locator('.modern-animation-storyboard-card')
        expect(cards.locator('img')).to_have_count(0)
        cards.nth(3).click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        image = cards.nth(3).locator('img')
        expect(image).to_have_attribute('src', re.compile(r'^data:image/(webp|png);base64,'))
        expect(cards.locator('img')).to_have_count(1)
        story.get_by_label('Capture selected keyframe thumbnail').click()
        expect(image).to_be_visible()
        cards.nth(1).click()
        expect(diag).to_contain_text('Rendered t=8.50s')
        expect(cards.locator('img')).to_have_count(2)
        self.assertFalse(self.page.evaluate('CurvatureModernApp.getStudioPlayback().playing'))
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getBuiltInDemo()'), 'soundly')
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_soundly_complete_storyboard_export_preserves_playhead(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary [data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        diag = self.page.locator('#ModernAnimationPlaybackDiagnostics')
        expect(diag).to_contain_text('Rendered t=0.00s', timeout=30000)
        story = self.page.locator('#ModernAnimationStoryboard')
        cards = story.locator('.modern-animation-storyboard-card')
        cards.nth(3).click()
        expect(diag).to_contain_text('Rendered t=20.95s', timeout=30000)
        before = self.page.evaluate('CurvatureModernApp.getStudioPlayback()')
        with self.page.expect_download(timeout=60000) as download:
            story.get_by_role('button', name='Export with thumbnails', exact=True).click()
        exported = json.loads(Path(download.value.path()).read_text(encoding='utf-8'))
        self.assertEqual(len(exported['animations'][0]['keyframeThumbnails']), 9)
        expect(cards.locator('img')).to_have_count(9)
        after = self.page.evaluate('CurvatureModernApp.getStudioPlayback()')
        self.assertEqual(after['positionMs'], before['positionMs'])
        self.assertEqual(after['playing'], before['playing'])
        expect(cards.nth(3)).to_have_attribute('aria-pressed', 'true')
        with self.page.expect_download() as download:
            story.get_by_role('button', name='Export without thumbnails', exact=True).click()
        compact = json.loads(Path(download.value.path()).read_text(encoding='utf-8'))
        self.assertNotIn('keyframeThumbnails', compact['animations'][0])
        self.assertEqual(compact['animations'][0]['project'], exported['animations'][0]['project'])
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_soundly_keyframe_thumbnails_survive_reload_and_copy(self):
        self.open_modern()
        self.open_animation()
        library = self.page.locator('#ModernAnimationLibrary')
        demo = library.locator('[data-demo-id="soundly"]')
        demo.get_by_text('Open demo', exact=True).click()
        cards = self.page.locator('#ModernAnimationStoryboard .modern-animation-storyboard-card')
        expect(cards).to_have_count(9)
        cards.nth(3).click()
        image = cards.nth(3).locator('img')
        expect(image).to_have_attribute('src', re.compile(r'^data:image/(webp|png);base64,'))
        original = image.get_attribute('src')
        self.page.wait_for_function("""async () => {
            const rows = await CurvatureModernExperimentThumbnail.createKeyframePersistence(indexedDB).read();
            return rows.some(row => row.image.dataUrl === %s);
        }""" % json.dumps(original))
        self.page.reload(wait_until='load')
        self.open_animation()
        demo.get_by_text('Open demo', exact=True).click()
        expect(image).to_have_attribute('src', original)
        demo.get_by_text('Create copy', exact=True).click()
        self.page.wait_for_function('CurvatureModernApp.getBuiltInDemo() === null')
        expect(image).to_have_attribute('src', original)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_builtin_demo_readonly_copy_and_reload(self):
        self.open_modern()
        self.open_animation()
        studio = self.page.locator('#ModernAnimationStudio')
        library = self.page.locator('#ModernAnimationLibrary')
        name = studio.get_by_label('Project name')
        name.fill('Retained user draft')
        expect(name).to_have_value('Retained user draft')
        self.page.wait_for_timeout(750)
        library.locator('[data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        expect(studio).to_contain_text('Built-in demo · Read-only')
        expect(self.page.locator('#ModernAnimationStoryboard .modern-animation-storyboard-card')).to_have_count(9)
        expect(studio.locator('.modern-studio-keyframe')).to_have_count(0)
        expect(studio.get_by_label('Project name')).to_have_count(0)
        expect(self.page.locator('#ModernAnimationPlaybackInterpolation')).to_be_disabled()
        self.assertEqual(self.page.evaluate('CurvatureModernApp.getBuiltInDemo()'), 'soundly')
        self.assertEqual(self.page.evaluate("""async () =>
            (await CurvatureModernAnimationLibrary.list(indexedDB)).length"""), 0)
        library.get_by_text('Close demo', exact=True).click()
        expect(studio.get_by_label('Project name')).to_have_value('Retained user draft')
        library.locator('[data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        expect(studio).to_contain_text('Built-in demo · Read-only')
        library.locator('[data-demo-id="soundly"]').get_by_text('Create copy', exact=True).click()
        expect(studio.get_by_label('Project name')).to_have_value(
            'Soundly Causeway · Bridge Camera Study (copy)')
        self.assertIsNone(self.page.evaluate('CurvatureModernApp.getBuiltInDemo()'))
        self.assertTrue(self.page.evaluate("""async () => {
            const rows = await CurvatureModernAnimationLibrary.list(indexedDB);
            const demo = CurvatureModernDemoCatalog.load()[0];
            return rows.length === 1 && rows[0].id !== demo.project.id &&
                rows[0].cover.startsWith('data:image/png;base64,');
        }"""))
        # Reloading while viewing a demo restores the last user project, not
        # a serialized editable version of the built-in.
        library.locator('[data-demo-id="soundly"]').get_by_text('Open demo', exact=True).click()
        expect(studio).to_contain_text('Built-in demo · Read-only')
        self.page.reload(wait_until='load')
        self.open_animation()
        expect(studio.get_by_label('Project name')).to_have_value(
            'Soundly Causeway · Bridge Camera Study (copy)')
        self.assertIsNone(self.page.evaluate('CurvatureModernApp.getBuiltInDemo()'))
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_demo_catalog_cards_and_direct_copy(self):
        self.open_modern()
        self.open_animation()
        library = self.page.locator('#ModernAnimationLibrary')
        studio = self.page.locator('#ModernAnimationStudio')
        demo = library.locator('[data-demo-id="soundly"]')
        expect(library.get_by_text('Built-in Demos · 1', exact=True)).to_be_visible()
        expect(library.get_by_text('My Projects · 0', exact=True)).to_be_visible()
        expect(demo.locator('.modern-animation-library-cover-image')).to_be_visible()
        expect(demo.locator('img')).to_have_js_property('complete', True)
        self.assertGreater(demo.locator('img').evaluate('(img) => img.naturalWidth'), 0)
        expect(demo.locator('.modern-card-delete')).to_have_count(0)
        expect(demo.get_by_role('button', name='Rename')).to_have_count(0)
        with self.page.expect_download() as download:
            demo.get_by_text('Export demo', exact=True).click()
        self.assertRegex(download.value.suggested_filename, r'^soundly-causeway-bridge-camera-study-vacuum-\d{8}-\d{6}-\d{3}(?:-with-thumbnails)?\.json$')
        exported = json.loads(Path(download.value.path()).read_text(encoding='utf-8'))['animations'][0]
        self.assertEqual(exported['project']['baseExperiment']['compare']['A']['atmosphere'], 'vacuum')
        self.assertEqual(exported['project']['baseExperiment']['compare']['B']['atmosphere'], 'vacuum')
        studio.get_by_label('Project name').fill('Keep original work')
        self.page.wait_for_timeout(750)
        copy = demo.get_by_text('Create copy', exact=True)
        copy.focus()
        copy.press('Enter')
        expect(studio.get_by_label('Project name')).to_have_value(
            'Soundly Causeway · Bridge Camera Study (copy)')
        expect(library.get_by_text('My Projects · 1', exact=True)).to_be_visible()
        personal = library.locator('[data-animation-id]')
        expect(personal).to_have_count(1)
        expect(personal.locator('.modern-animation-library-cover-image')).to_have_attribute(
            'src', re.compile('^data:image/png;base64,'))
        expect(demo.locator('.modern-demo-card-status')).to_have_text('Built-in · Read-only')
        expect(library).to_contain_text('Keep original work')
        personal.click()
        expect(demo).not_to_have_class(re.compile('is-selected'))
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_personal_cover_editor_and_default_demo_optics(self):
        self.open_modern()
        self.open_animation()
        library = self.page.locator('#ModernAnimationLibrary')
        demo = library.locator('[data-demo-id="soundly"]')
        optics = self.page.locator('#ModernAnimationPlaybackOptics')
        demo.get_by_text('Open demo', exact=True).click()
        expect(optics).to_have_value('canvas-direct')
        demo.get_by_text('Create copy', exact=True).click()
        personal = library.locator('[data-animation-id]')
        expect(personal).to_have_count(1)
        expect(optics).to_have_value('canvas-direct')
        expect(personal.get_by_text('Remove cover', exact=True)).to_be_enabled()
        original = personal.locator('.modern-animation-library-cover-image').get_attribute('src')
        personal.get_by_text('Remove cover', exact=True).click()
        expect(personal.locator('.modern-animation-library-cover-image')).to_have_count(0)
        personal.locator('input[type=file]').set_input_files(str(ROOT / 'demos/modern/covers/soundly.png'))
        expect(personal.locator('.modern-animation-library-cover-image')).to_have_attribute(
            'src', re.compile('^data:image/jpeg;base64,'))
        expect(personal.get_by_text('Capture frame', exact=True)).to_be_enabled()
        # Wait for the initial paused preview to complete before capturing.
        expect(self.page.locator('#ModernAnimationFrameLoadingA')).to_be_hidden(timeout=30000)
        personal.get_by_text('Capture frame', exact=True).click()
        expect(personal.locator('.modern-animation-library-cover-image')).to_have_attribute(
            'src', re.compile('^data:image/(webp|png);base64,'))
        self.assertTrue(self.page.evaluate("""async () => {
            const rows = await CurvatureModernAnimationLibrary.list(indexedDB);
            return rows.length === 1 && rows[0].quality === 'canvas-direct' &&
              /^data:image\\/(webp|png);base64,/.test(rows[0].cover);
        }"""))
        self.assertIsNotNone(original)
        expect(demo.locator('.modern-animation-library-cover-image')).to_have_attribute(
            'src', 'demos/modern/covers/soundly.png')
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_navigation_and_studio_bootstrap(self):
        self.open_modern()
        self.page.locator('#ModernCompareTab').click()
        expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed', 'true')
        self.open_animation()
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_chicago_preset_compare_and_history_return(self):
        self.open_modern()
        preset = self.page.locator('#ModernPreset')
        expect(preset).to_have_value('pontchartrain')
        preset.select_option('chicago')
        expect(preset).to_have_value('chicago', timeout=30000)
        expect(self.page.locator('#ModernSceneTitle')).to_contain_text('Chicago Skyline')
        self.assertEqual(self.page.evaluate('''() => ({
            types: window.CurvatureModernApp.getModel().ObjType,
            counts: window.CurvatureModernApp.getModel().NObjects,
            atmosphere: document.getElementById('ModernAtmosphere').value,
        })'''), {'types': [4, 3], 'counts': [6, 0], 'atmosphere': 'standard'})
        self.page.locator('#ModernCompareTab').click()
        expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed', 'true')
        self.page.locator('#ModernSceneTab').click()
        self.page.locator('#ModernPreviousExperiment').click()
        expect(preset).to_have_value('pontchartrain', timeout=30000)
        self.assertEqual(self.page.evaluate('window.CurvatureModernApp.getModel().ObjType'), [3, 3])
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_causeway_preset_and_compare_return(self):
        self.open_modern()
        preset = self.page.locator('#ModernPreset')
        preset.select_option('causeway')
        expect(preset).to_have_value('causeway', timeout=30000)
        expect(self.page.locator('#ModernSceneTitle')).to_contain_text('Pontchartrain Causeway')
        self.assertEqual(self.page.evaluate("""() => ({
            types: window.CurvatureModernApp.getModel().ObjType,
            counts: window.CurvatureModernApp.getModel().NObjects,
            atmosphere: document.getElementById('ModernAtmosphere').value,
        })"""), {'types': [6, 3], 'counts': [41, 0], 'atmosphere': 'vacuum'})
        self.page.locator('#ModernCompareTab').click()
        expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed', 'true')
        self.page.locator('#ModernSceneTab').click()
        self.page.locator('#ModernPreviousExperiment').click()
        expect(preset).to_have_value('pontchartrain', timeout=30000)

    def test_tensas_preset_compare_and_history_return(self):
        self.open_modern()
        preset = self.page.locator('#ModernPreset')
        preset.select_option('tensas')
        expect(preset).to_have_value('tensas', timeout=30000)
        expect(self.page.locator('#ModernSceneTitle')).to_contain_text('Little Tensas Bayou')
        self.assertEqual(self.page.evaluate("""() => ({
            types: window.CurvatureModernApp.getModel().ObjType,
            counts: window.CurvatureModernApp.getModel().NObjects,
            atmosphere: document.getElementById('ModernAtmosphere').value,
        })"""), {'types': [7, 3], 'counts': [87, 0], 'atmosphere': 'vacuum'})
        self.page.locator('#ModernCompareTab').click()
        expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed', 'true')
        self.page.locator('#ModernSceneTab').click()
        self.page.locator('#ModernPreviousExperiment').click()
        expect(preset).to_have_value('pontchartrain', timeout=30000)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_soundly_preset_compare_and_history_return(self):
        self.open_modern()
        preset = self.page.locator('#ModernPreset')
        preset.select_option('soundly')
        expect(preset).to_have_value('soundly', timeout=30000)
        expect(self.page.locator('#ModernSceneTitle')).to_contain_text('Soundly Causeway')
        self.assertEqual(self.page.evaluate("""() => ({
            types: window.CurvatureModernApp.getModel().ObjType,
            counts: window.CurvatureModernApp.getModel().NObjects,
            atmosphere: document.getElementById('ModernAtmosphere').value,
        })"""), {'types': [8, 3], 'counts': [128, 0], 'atmosphere': 'vacuum'})
        self.page.locator('#ModernCompareTab').click()
        expect(self.page.locator('#ModernCompareTab')).to_have_attribute('aria-pressed', 'true')
        self.page.locator('#ModernSceneTab').click()
        self.page.locator('#ModernPreviousExperiment').click()
        expect(preset).to_have_value('pontchartrain', timeout=30000)
        self.assertFalse([msg for msg in self.console if msg.startswith('PAGE ERROR:')], self.console)

    def test_wizard_can_be_opened_and_cancelled(self):
        self.open_modern()
        self.open_animation()
        self.page.locator('#ModernAnimationLibrary').get_by_text('New project', exact=True).click()
        wizard = self.page.locator('#ModernAnimationProjectWizard')
        expect(wizard).to_be_visible()
        expect(wizard).to_contain_text('Step 1 of 5')
        wizard.get_by_role('button', name='Cancel').click()
        expect(wizard).to_be_hidden()

    def test_working_draft_survives_reload(self):
        self.open_modern()
        self.open_animation()
        studio = self.page.locator('#ModernAnimationStudio')
        name = studio.get_by_label('Project name')
        name.fill('CI autosave workspace')
        expect(name).to_have_value('CI autosave workspace')
        # Give the IndexedDB debounce a chance, but the pagehide/localStorage
        # checkpoint must also protect the edit when reloading.
        self.page.wait_for_timeout(750)
        self.page.reload(wait_until='load')
        self.open_animation()
        expect(self.page.locator('#ModernAnimationStudio').get_by_label('Project name')).to_have_value(
            'CI autosave workspace'
        )

    def create_camera_project(self, name):
        """Create a real v2 project through the five-step wizard."""
        library = self.page.locator('#ModernAnimationLibrary')
        library.get_by_text('New project', exact=True).click()
        wizard = self.page.locator('#ModernAnimationProjectWizard')
        wizard.get_by_role('button', name='Next').click()  # Camera Motion (default)
        wizard.get_by_role('button', name='Use current Scene/Compare as reference').click()
        wizard.get_by_role('button', name='Next').click()
        wizard.get_by_role('button', name='Next').click()  # Allowed changes
        wizard.get_by_label('Include reference as first keyframe').check()
        wizard.get_by_role('button', name='Next').click()
        wizard.get_by_label('Project name').fill(name)
        wizard.get_by_role('button', name='Create project').click()
        expect(library).to_contain_text('1 saved project', timeout=20000)

    def test_wizard_creates_persisted_project(self):
        self.open_modern()
        self.open_animation()
        self.create_camera_project('CI Camera Motion')
        self.page.reload(wait_until='load')
        self.open_animation()
        expect(self.page.locator('#ModernAnimationLibrary')).to_contain_text('CI Camera Motion')

    def test_keyframe_undo_redo_after_focus_leaves_editor(self):
        self.open_modern()
        self.open_animation()
        self.create_camera_project('CI Undo Camera Motion')
        editor = self.page.locator('#ModernAnimationStudio')
        frame_name = editor.get_by_label('Frame name')
        original = frame_name.input_value()
        self.assertTrue(original)
        frame_name.fill('CI renamed keyframe')
        expect(frame_name).to_have_value('CI renamed keyframe')
        # The old regression only listened for Ctrl+Z inside the Studio node.
        # Moving focus out of the editor must not lose keyboard undo.
        editor.locator('.modern-studio-header').click()
        self.page.keyboard.press('Control+z')
        expect(editor.get_by_label('Frame name')).to_have_value(original)
        self.page.keyboard.press('Control+y')
        expect(editor.get_by_label('Frame name')).to_have_value('CI renamed keyframe')


if __name__ == '__main__':
    unittest.main()
