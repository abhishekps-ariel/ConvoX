import { useState, useRef, useCallback } from 'react';
import { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

export const useImageCrop = () => {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [imgSrc, setImgSrc] = useState('');
  const [showCropModal, setShowCropModal] = useState(false);
  const [croppedImage, setCroppedImage] = useState<string>('');
  
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const crop = centerCrop(
      makeAspectCrop(
        {
          unit: '%',
          width: 90,
        },
        1,
        width,
        height
      ),
      width,
      height
    );
    setCrop(crop);
  }, []);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCrop(undefined);
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        setImgSrc(reader.result?.toString() || '');
        setShowCropModal(true);
      });
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handleCropComplete = (callback: (croppedImage: string) => void) => {
    if (completedCrop && imgRef.current) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const image = imgRef.current;
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      canvas.width = completedCrop.width;
      canvas.height = completedCrop.height;

      ctx.drawImage(
        image,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        completedCrop.width,
        completedCrop.height
      );

      const croppedImageUrl = canvas.toDataURL('image/jpeg', 0.8);
      setCroppedImage(croppedImageUrl);
      callback(croppedImageUrl);
      setShowCropModal(false);
    }
  };

  const handleCropCancel = () => {
    setShowCropModal(false);
    setImgSrc('');
    setCrop(undefined);
    setCompletedCrop(undefined);
  };

  return {
    crop,
    setCrop,
    completedCrop,
    setCompletedCrop,
    imgSrc,
    setImgSrc,
    showCropModal,
    setShowCropModal,
    croppedImage,
    setCroppedImage,
    imgRef,
    onImageLoad,
    handleImageSelect,
    handleCropComplete,
    handleCropCancel,
  };
};
