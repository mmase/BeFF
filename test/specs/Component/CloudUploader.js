define([
  'jquery',
  'nbd/Promise',
  'mocks/fineuploader',
  'Component/CloudUploader'
], function($, Promise, fineUploaderMock, CloudUploader) {
  'use strict';

  describe('Component/CloudUploader', function() {
    var Uploader, fineuploaderMock;

    Uploader = CloudUploader.extend({
      init: function(options) {
        options = options || {};
        options.signature = {
          endpoint: 'http://example.com/signature'
        };
        options.request = {
          endpoint: 'http://example.com/example',
          accessKey: '12345'
        };
        options.disabled = false;
        this._super(options);

        if (options.mock !== false) {
          this._uploader = new fineUploaderMock.s3.FineUploaderBasic(this._config);
          fineuploaderMock = this._uploader;
        }
      },

      choose: {}
    });

    beforeEach(function() {
      this.uploader = Uploader.init();
    });

    afterEach(function() {
      this.uploader.destroy();
    });

    describe('events', function() {
      it('fires the complete event on a successful upload', function(done) {
        spyOn(this.uploader._uploader, 'getKey').and.returnValue('1.jpg');

        this.uploader.on('complete', function(data) {
          expect(data.response.http_code).toBe(200);
          expect(data.id).toBe(0);
          expect(data.uploadEndpoint).toBe('http://example.com/example');
          expect(data.uploadPath).toBe('1.jpg');
          done();
        });

        fineuploaderMock.fakeSubmitAndComplete(null, null, {
          http_code: 200
        });
      });

      it('fires the allComplete event when all uploads are complete', function(done) {
        this.uploader.on('allComplete', done);
        fineuploaderMock.fakeAllComplete();
      });

      it('fires the submit event after a successful submission', function(done) {
        this.uploader.on('submit', function(data) {
          expect(data.name).toBeDefined();
          expect(data.id).toBeDefined();
          expect(data.file.readerData).toBeDefined();
          done();
        });
        fineuploaderMock.fakeSubmit();
      });

      it('fires the error event on an upload error', function(done) {
        this.uploader.on('error', function(data) {
          expect(data.id).toBe(0);
          expect(data.name).toBe(fineuploaderMock.getFakeImageName());
          expect(data.message).toBe('image upload error');
          expect('xhr' in data).toBeTruthy();
          done();
        }.bind(this));

        fineuploaderMock.fakeSubmitAndUploadError(null, null, 'image upload error');
      });

      it('fires the cancel event on an upload cancel', function(done) {
        this.uploader.on('cancel', function(data) {
          expect('id' in data).toBeTruthy();
          expect('name' in data).toBeTruthy();
          done();
        });
        fineuploaderMock.fakeCancel();
      });
    });

    describe('#promise', function() {
      it('returns a promise resolved with an array of progress aware subpromises', function(done) {
        var loaded = 5,
            total = 100;

        spyOn(Uploader.prototype, 'choose').and.callFake(function() {
          var file1 = { id: 1, size: 1, name: 'a.jpg' },
              file2 = { id: 2, size: 2, name: 'b.jpg' };

          fineuploaderMock.fakeValidateBatch([file1, file2]);
          Promise.all([
            fineuploaderMock.fakeSubmit(file1.id, file1.name),
            fineuploaderMock.fakeValidationError(file2.id, file2.name, 'oopsy')
          ]).then(function() {
            fineuploaderMock.fakeProgress(file1.id, file1.name, loaded, total);
            fineuploaderMock.fakeComplete(file1.id, file1.name);
            fineuploaderMock.fakeAllComplete();
          });
        });

        Uploader.promise().then(function(fileArray) {
          expect(fileArray[0].file.readerData).toBeDefined();
          expect(fileArray[1].file).toBe(null);
          Promise.all([
            fileArray[0].promise,
            fileArray[1].promise.catch(function() {
              return Promise.resolve('caught');
            }),
            new Promise(function(resolve) {
              fileArray[0].promise.one('progress', resolve);
            })
          ]).then(function(retvals) {
            expect(retvals[0].file).toBe(fileArray[0].file);
            expect(retvals[1]).toBe('caught');
            expect(retvals[2].loaded).toBe(loaded);
            expect(retvals[2].total).toBe(total);
            done();
          });
        });
      });
    });

    describe('#formatSize', function() {
      beforeEach(function() {
        this.unmockedUploader = Uploader.init({ mock: false });
      });

      afterEach(function() {
        this.unmockedUploader.destroy();
      });

      it('returns kB for kilobytes', function() {
        expect(this.unmockedUploader.formatSize(1)).toBe('0.1kB');
        expect(this.unmockedUploader.formatSize(1024)).toBe('1.0kB');
      });

      it('returns MB for megabytes', function() {
        expect(this.unmockedUploader.formatSize(1024 * 1024)).toBe('1.0MB');
      });
    });
  });
});