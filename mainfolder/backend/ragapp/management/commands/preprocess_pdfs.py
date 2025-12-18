"""
Django management command to preprocess all PDFs before users login
Usage: python manage.py preprocess_pdfs
"""

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
import os
import time
from datetime import datetime

class Command(BaseCommand):
    help = 'Preprocess all PDFs and store in ChromaDB before users login'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force reprocessing even if ChromaDB already has data',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed processing information',
        )

    def handle(self, *args, **options):
        start_time = time.time()
        self.stdout.write(
            self.style.SUCCESS(f'Starting PDF preprocessing at {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
        )
        
        try:
            # Import here to avoid import errors during Django setup
            from rag_app import chroma_client, collection_name, process_pdf
            
            # Check if ChromaDB already has data
            if not options['force']:
                try:
                    collection = chroma_client.get_collection(collection_name)
                    count = collection.count()
                    if count > 0:
                        self.stdout.write(
                            self.style.WARNING(f'WARNING: ChromaDB already contains {count} documents')
                        )
                        if not options['force']:
                            self.stdout.write(
                                self.style.SUCCESS('SUCCESS: Skipping preprocessing - use --force to reprocess')
                            )
                            return
                except:
                    pass
            
            # Get PDF directory
            upload_dir = os.path.join(settings.BASE_DIR, 'uploaded_pdfs')
            
            if not os.path.exists(upload_dir):
                raise CommandError(f'ERROR: PDF directory not found: {upload_dir}')
            
            # Get all PDF files
            pdf_files = [f for f in os.listdir(upload_dir) if f.lower().endswith('.pdf')]
            
            if not pdf_files:
                raise CommandError(f'ERROR: No PDF files found in {upload_dir}')
            
            self.stdout.write(
                self.style.SUCCESS(f'Found {len(pdf_files)} PDF files to process')
            )
            
            # Process each PDF
            processed_count = 0
            errors = []
            
            for i, filename in enumerate(pdf_files, 1):
                try:
                    file_path = os.path.join(upload_dir, filename)
                    
                    if options['verbose']:
                        self.stdout.write(f'[{i}/{len(pdf_files)}] Processing: {filename}')
                    else:
                        self.stdout.write(f'Processing: {filename} ({i}/{len(pdf_files)})')
                    
                    # Process the PDF
                    process_pdf(file_path, filename, None)
                    processed_count += 1
                    
                    if options['verbose']:
                        self.stdout.write(
                            self.style.SUCCESS(f'SUCCESS: Successfully processed: {filename}')
                        )
                    
                except Exception as e:
                    error_msg = f'ERROR: Failed to process {filename}: {str(e)}'
                    errors.append(error_msg)
                    self.stdout.write(self.style.ERROR(error_msg))
            
            # Final status
            end_time = time.time()
            processing_time = end_time - start_time
            
            self.stdout.write('\n' + '='*60)
            self.stdout.write(
                self.style.SUCCESS(f'PDF Preprocessing Complete!')
            )
            self.stdout.write(f'Successfully processed: {processed_count}/{len(pdf_files)} PDFs')
            self.stdout.write(f'Processing time: {processing_time:.2f} seconds')
            
            if errors:
                self.stdout.write(
                    self.style.WARNING(f'WARNING: {len(errors)} errors occurred:')
                )
                for error in errors:
                    self.stdout.write(f'   {error}')
            
            # Verify ChromaDB
            try:
                collection = chroma_client.get_collection(collection_name)
                final_count = collection.count()
                self.stdout.write(
                    self.style.SUCCESS(f'ChromaDB now contains {final_count} document chunks')
                )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'ERROR: Error verifying ChromaDB: {e}')
                )
            
            self.stdout.write(
                self.style.SUCCESS('SUCCESS: System ready for users!')
            )
            
        except Exception as e:
            raise CommandError(f'ERROR: Preprocessing failed: {str(e)}')
